import type { AgentAction, AgentTurn, Scene, Space, SpatialRelation } from "@/types";
import type { AIProvider, SpaceEdge } from "./types";

/**
 * MOCK AI provider (§33 of the platform spec).
 *
 * No LLM or vision model is called here. `answerConciergeQuestion`
 * implements the R&D blueprint's Agent Architecture (§22) honestly for a
 * system with no real language model yet:
 *
 *   question -> parseIntent() [deterministic, NOT an LLM] -> a typed tool
 *   call against the real spatial graph (spaces/relations/connections
 *   passed in by the caller) -> a validated result -> a typed AgentAction.
 *
 * `parseIntent` is a plain keyword/regex matcher, clearly not language
 * understanding — it exists so the *architecture* (intent -> tool ->
 * engine -> validated result) is real and testable today, ready for a
 * real LLM to be dropped in as a better intent parser later without
 * changing what happens downstream (blueprint §65: reality over
 * hallucination — a rule-based parser that says "I don't understand" is
 * strictly better than an LLM that invents a room).
 */

type Intent =
  | { tool: "navigate"; targetHint: string }
  | { tool: "search_by_relation"; predicate: string; target: string }
  | { tool: "calculate_distance"; fromHint: string; toHint: string }
  | { tool: "unknown" };

const RELATION_PHRASES: { predicate: string; pattern: RegExp }[] = [
  { predicate: "has", pattern: /(?:with|have|has) (?:a |an )?([a-z ]+?)(?:\?|$|\.)/i },
];

function parseIntent(question: string): Intent {
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

export class MockAIProvider implements AIProvider {
  readonly id = "mock";

  async analyzeScene(input: { spaceId: string; frameUrls: string[] }): Promise<{
    warnings: string[];
  }> {
    const warnings: string[] = [];
    if (input.frameUrls.length < 8) {
      warnings.push("Low frame count may reduce scene understanding accuracy.");
    }
    return { warnings };
  }

  async generateSpaceDescription(input: { space: Space; scene: Scene | null }): Promise<string> {
    const objectCount = input.scene?.objects.length ?? 0;
    const kindLabel = input.space.kind.replace(/_/g, " ").toLowerCase();
    return objectCount > 0
      ? `${input.space.name} — a ${kindLabel} with ${objectCount} identified elements.`
      : `${input.space.name} — a ${kindLabel}.`;
  }

  async answerConciergeQuestion(input: {
    question: string;
    spaces: Space[];
    relations: SpatialRelation[];
    connections: SpaceEdge[];
  }): Promise<AgentTurn> {
    const intent = parseIntent(input.question);
    const actions: AgentAction[] = [];

    const findSpaceByHint = (hint: string): Space | undefined =>
      input.spaces.find((s) => hint.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(hint)) ??
      input.spaces.find((s) => hint.includes(s.kind.toLowerCase().replace(/_/g, " ")));

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
        const matches = input.relations.filter(
          (r) =>
            r.subjectType === "SPACE" &&
            r.predicate === intent.predicate &&
            (r.objectLabel?.toLowerCase().includes(intent.target) ?? false)
        );
        const matchedSpaces = matches
          .map((r) => input.spaces.find((s) => s.id === r.subjectId))
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
          const hops = bfsHops(input.connections, from.id, to.id);
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
        const matches = input.spaces.filter(
          (s) =>
            input.question.toLowerCase().includes(s.name.toLowerCase()) ||
            input.question.toLowerCase().includes(s.kind.toLowerCase().replace(/_/g, " "))
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

    return { question: input.question, actions };
  }
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
