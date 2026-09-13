import { describe, expect, it } from "vitest";
import { MockAIProvider } from "@/providers/ai/mock-ai-provider";
import type { Space, SpatialRelation } from "@/types";

function space(overrides: Partial<Space>): Space {
  return {
    id: overrides.id ?? "space-1",
    projectId: "project-1",
    name: overrides.name ?? "Lobby",
    kind: overrides.kind ?? "LOBBY",
    order: 0,
    coverAssetId: null,
    parentSpaceId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function relation(overrides: Partial<SpatialRelation>): SpatialRelation {
  return {
    id: overrides.id ?? "rel-1",
    projectId: "project-1",
    subjectType: "SPACE",
    subjectId: overrides.subjectId ?? "space-1",
    predicate: overrides.predicate ?? "has",
    objectType: "CONCEPT",
    objectId: null,
    objectLabel: overrides.objectLabel ?? "balcony",
    confidence: 1,
    provenance: "REAL",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("MockAIProvider.answerConciergeQuestion", () => {
  const provider = new MockAIProvider();
  const spaces = [
    space({ id: "s1", name: "Pool Deck", kind: "POOL" }),
    space({ id: "s2", name: "Suite 204", kind: "SUITE" }),
    space({ id: "s3", name: "Corridor", kind: "CORRIDOR" }),
  ];
  const connections = [
    { fromSpaceId: "s2", toSpaceId: "s3" },
    { fromSpaceId: "s3", toSpaceId: "s1" },
  ];

  it("navigates to a space matched by name (intent: navigate)", async () => {
    const turn = await provider.answerConciergeQuestion({
      question: "Where is the pool?",
      spaces,
      relations: [],
      connections: [],
    });
    expect(turn.actions[0]).toMatchObject({ action: "navigate", targetSpaceId: "s1" });
  });

  it("never invents a space that does not exist", async () => {
    const turn = await provider.answerConciergeQuestion({
      question: "Where is the spa?",
      spaces,
      relations: [],
      connections: [],
    });
    expect(turn.actions).toEqual([{ action: "no_action", reason: expect.any(String) }]);
  });

  it("answers with matches without navigating when the question isn't a navigation request", async () => {
    const turn = await provider.answerConciergeQuestion({
      question: "Tell me about Suite 204",
      spaces,
      relations: [],
      connections: [],
    });
    expect(turn.actions[0]?.action).toBe("answer");
  });

  it("resolves 'rooms with X' via the relation graph, not string matching on room names (intent: search_by_relation)", async () => {
    const relations = [relation({ subjectId: "s2", predicate: "has", objectLabel: "balcony" })];
    const turn = await provider.answerConciergeQuestion({
      question: "Which rooms have a balcony?",
      spaces,
      relations,
      connections: [],
    });
    expect(turn.actions[0]).toMatchObject({ action: "navigate", targetSpaceId: "s2" });
  });

  it("reports no match when no relation exists for the asked concept, rather than guessing", async () => {
    const turn = await provider.answerConciergeQuestion({
      question: "Which rooms have a jacuzzi?",
      spaces,
      relations: [relation({ subjectId: "s2", predicate: "has", objectLabel: "balcony" })],
      connections: [],
    });
    expect(turn.actions[0]?.action).toBe("no_action");
  });

  it("computes distance via real graph traversal, not an invented number (intent: calculate_distance)", async () => {
    const turn = await provider.answerConciergeQuestion({
      question: "How far is Suite 204 from Pool Deck?",
      spaces,
      relations: [],
      connections,
    });
    expect(turn.actions[0]?.action).toBe("answer");
    expect((turn.actions[0] as { text: string }).text).toContain("2 rooms away");
  });
});
