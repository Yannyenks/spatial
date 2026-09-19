import type { AgentAction, Space, SpatialRelation } from "@/types";
import type { SpaceEdge } from "./types";

/**
 * The typed tool-call contract every intent parser (regex-based or LLM-
 * based) must produce. Whatever decides *which* tool to call — a plain
 * parser or a real model — this shape, and everything downstream of it
 * (`executeIntent`), stays identical: the tool execution against the real
 * spatial graph is never delegated to a model (§16, §65: "never let an
 * LLM invent a distance").
 */
export type Intent =
  | { tool: "navigate"; targetHint: string }
  | { tool: "search_by_relation"; predicate: string; target: string }
  | { tool: "calculate_distance"; fromHint: string; toHint: string }
  | { tool: "unknown" };

const RELATION_PHRASES: { predicate: string; pattern: RegExp }[] = [
  { predicate: "has", pattern: /(?:with|have|has) (?:a |an )?([a-z ]+?)(?:\?|$|\.)/i },
];

/**
 * Deterministic, non-LLM intent parser — a plain keyword/regex matcher.
 * Used as the mock provider's only parser, and as every real-LLM
 * provider's fallback when the model call fails or returns something
 * that doesn't parse as a valid `Intent`: a rule-based "I don't
 * understand" is strictly better than either crashing or an LLM
 * hallucinating a room (§65).
 */
export function parseIntentDeterministic(question: string): Intent {
  const q = question.toLowerCase().trim();

  const distanceMatch = q.match(/how far is (.+?) from (.+?)(?:\?|$)/);
  if (distanceMatch) {
    return { tool: "calculate_distance", fromHint: distanceMatch[1]!.trim(), toHint: distanceMatch[2]!.trim() };
  }

  for (const { predicate, pattern } of RELATION_PHRASES) {
    const match = q.match(pattern);
    if (match && /rooms?|spaces?|suites?/.test(q)) {
      return { tool: "search_by_relation", predicate, target: match[1]!.trim() };
    }
  }

  if (/where is|take me to|show me|go to|navigate/.test(q)) {
    const target = q
      .replace(/where is|take me to|show me|go to|navigate to|navigate/g, "")
      .replace(/[?.]/g, "")
      .trim();
    return { tool: "navigate", targetHint: target };
  }

  return { tool: "unknown" };
}

/**
 * Executes a typed `Intent` against the real spatial graph, returning
 * only validated `AgentAction`s. This is the one place that ever answers
 * a concierge question — identical for every `AIProvider`, real or mock —
 * so a real LLM being wrong about *which* tool to call can produce a
 * wrong or "no_action" answer, but can never invent a room, relation, or
 * distance that isn't backed by `context`.
 */
export function executeIntent(
  intent: Intent,
  context: { question: string; spaces: Space[]; relations: SpatialRelation[]; connections: SpaceEdge[] }
): AgentAction[] {
  const actions: AgentAction[] = [];

  const findSpaceByHint = (hint: string): Space | undefined =>
    context.spaces.find((s) => hint.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(hint)) ??
    context.spaces.find((s) => hint.includes(s.kind.toLowerCase().replace(/_/g, " ")));

  switch (intent.tool) {
    case "navigate": {
      const target = findSpaceByHint(intent.targetHint);
      if (target) {
        actions.push({ action: "navigate", targetSpaceId: target.id });
        actions.push({ action: "answer", text: `Here is ${target.name}.` });
      } else {
        actions.push({ action: "no_action", reason: "No space in this project matches the question yet." });
      }
      break;
    }

    case "search_by_relation": {
      const matches = context.relations.filter(
        (r) =>
          r.subjectType === "SPACE" &&
          r.predicate === intent.predicate &&
          (r.objectLabel?.toLowerCase().includes(intent.target) ?? false)
      );
      const matchedSpaces = matches
        .map((r) => context.spaces.find((s) => s.id === r.subjectId))
        .filter((s): s is Space => Boolean(s));

      if (matchedSpaces.length === 0) {
        actions.push({
          action: "no_action",
          reason: `No space is recorded as having "${intent.target}" yet.`,
        });
      } else if (matchedSpaces.length === 1) {
        actions.push({ action: "navigate", targetSpaceId: matchedSpaces[0]!.id });
        actions.push({ action: "answer", text: `${matchedSpaces[0]!.name} has ${intent.target}.` });
      } else {
        actions.push({
          action: "answer",
          text: `${matchedSpaces.length} spaces have ${intent.target}: ${matchedSpaces.map((s) => s.name).join(", ")}.`,
        });
      }
      break;
    }

    case "calculate_distance": {
      const from = findSpaceByHint(intent.fromHint);
      const to = findSpaceByHint(intent.toHint);
      if (!from || !to) {
        actions.push({ action: "no_action", reason: "I couldn't identify both spaces in that question." });
      } else {
        const hops = bfsHops(context.connections, from.id, to.id);
        actions.push({
          action: "answer",
          text:
            hops === null
              ? `${from.name} and ${to.name} aren't connected in the navigation graph yet.`
              : hops === 0
                ? `That's the same space.`
                : `${to.name} is ${hops} room${hops > 1 ? "s" : ""} away from ${from.name} via the navigation graph.`,
        });
      }
      break;
    }

    case "unknown":
    default: {
      const matches = context.spaces.filter(
        (s) =>
          context.question.toLowerCase().includes(s.name.toLowerCase()) ||
          context.question.toLowerCase().includes(s.kind.toLowerCase().replace(/_/g, " "))
      );
      if (matches.length > 0) {
        actions.push({
          action: "answer",
          text: `I found ${matches.length} matching space${matches.length > 1 ? "s" : ""}: ${matches
            .map((m) => m.name)
            .join(", ")}.`,
        });
      } else {
        actions.push({ action: "no_action", reason: "No space in this project matches the question yet." });
      }
    }
  }

  return actions;
}

/** Same BFS as spatial-query.service.ts, duplicated here to keep providers/ai free of a Prisma dependency. */
function bfsHops(edges: SpaceEdge[], fromId: string, toId: string): number | null {
  if (fromId === toId) return 0;
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.fromSpaceId)) adjacency.set(edge.fromSpaceId, []);
    adjacency.get(edge.fromSpaceId)!.push(edge.toSpaceId);
  }
  const visited = new Set([fromId]);
  let frontier = [fromId];
  let hops = 0;
  while (frontier.length > 0) {
    hops += 1;
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (neighbor === toId) return hops;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
    if (hops > 50) return null;
  }
  return null;
}
