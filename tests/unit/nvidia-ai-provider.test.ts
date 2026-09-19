import { afterEach, describe, expect, it, vi } from "vitest";
import { NvidiaAIProvider } from "@/providers/ai/nvidia-ai-provider";
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

function stubChatResponse(content: string | null, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      ok
        ? new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
        : new Response("rate limited", { status: 429 })
    )
  );
}

describe("NvidiaAIProvider.answerConciergeQuestion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const provider = new NvidiaAIProvider("fake-key", "meta/llama-3.1-8b-instruct");
  const spaces = [
    space({ id: "s1", name: "Pool Deck", kind: "POOL" }),
    space({ id: "s2", name: "Suite 204", kind: "SUITE" }),
  ];

  it("executes the real spatial graph using the LLM's valid structured intent", async () => {
    stubChatResponse(JSON.stringify({ tool: "navigate", targetHint: "pool" }));

    const turn = await provider.answerConciergeQuestion({
      question: "Could you point me toward the pool area?",
      spaces,
      relations: [],
      connections: [],
    });

    expect(turn.actions[0]).toMatchObject({ action: "navigate", targetSpaceId: "s1" });
  });

  it("never lets the model invent a room that isn't in the real graph", async () => {
    // A misbehaving/hallucinating model could still only emit a *hint* —
    // executeIntent is what decides whether that hint matches a real space.
    stubChatResponse(JSON.stringify({ tool: "navigate", targetHint: "the imaginary rooftop bar" }));

    const turn = await provider.answerConciergeQuestion({
      question: "Take me to the rooftop bar",
      spaces,
      relations: [],
      connections: [],
    });

    expect(turn.actions).toEqual([{ action: "no_action", reason: expect.any(String) }]);
  });

  it("falls back to the deterministic parser when the model returns unparseable JSON", async () => {
    stubChatResponse("sure thing! the pool is great <not json>");

    const turn = await provider.answerConciergeQuestion({
      question: "Where is the pool?",
      spaces,
      relations: [],
      connections: [],
    });

    // The deterministic regex parser handles "where is X" the same way the
    // mock provider's tests already verify.
    expect(turn.actions[0]).toMatchObject({ action: "navigate", targetSpaceId: "s1" });
  });

  it("falls back to the deterministic parser when the model returns a shape that isn't a valid Intent", async () => {
    stubChatResponse(JSON.stringify({ tool: "book_a_room", roomId: "s2" }));

    const turn = await provider.answerConciergeQuestion({
      question: "Where is suite 204?",
      spaces,
      relations: [],
      connections: [],
    });

    expect(turn.actions[0]).toMatchObject({ action: "navigate", targetSpaceId: "s2" });
  });

  it("falls back to the deterministic parser when the API call fails outright", async () => {
    stubChatResponse(null, false);

    const turn = await provider.answerConciergeQuestion({
      question: "Where is the pool?",
      spaces,
      relations: [],
      connections: [],
    });

    expect(turn.actions[0]).toMatchObject({ action: "navigate", targetSpaceId: "s1" });
  });

  it("falls back to the deterministic parser when fetch itself throws (network error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    const turn = await provider.answerConciergeQuestion({
      question: "Where is the pool?",
      spaces,
      relations: [],
      connections: [],
    });

    expect(turn.actions[0]).toMatchObject({ action: "navigate", targetSpaceId: "s1" });
  });

  it("resolves relation-based questions through the real relation graph, not the model's own claim", async () => {
    stubChatResponse(JSON.stringify({ tool: "search_by_relation", predicate: "has", target: "balcony" }));
    const relations = [relation({ subjectId: "s2", predicate: "has", objectLabel: "balcony" })];

    const turn = await provider.answerConciergeQuestion({
      question: "Which rooms have a balcony?",
      spaces,
      relations,
      connections: [],
    });

    expect(turn.actions[0]).toMatchObject({ action: "navigate", targetSpaceId: "s2" });
  });
});

describe("NvidiaAIProvider.analyzeScene", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const provider = new NvidiaAIProvider("fake-key");

  it("keeps the deterministic low-frame-count check regardless of vision results", async () => {
    stubChatResponse("[]");
    const result = await provider.analyzeScene({ spaceId: "space-1", frameUrls: ["a", "b"], sampleImageUrls: [] });
    expect(result.warnings).toContain("Low frame count may reduce scene understanding accuracy.");
  });

  it("merges real per-photo issues from the vision model, deduplicated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        const imageUrl = body.messages[1].content[1].image_url.url;
        const issues =
          imageUrl === "https://example.com/photo-1.jpg"
            ? ["The room looks poorly lit."]
            : ["The room looks poorly lit."]; // same real issue seen in both photos
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(issues) } }] }), {
          status: 200,
        });
      })
    );

    const result = await provider.analyzeScene({
      spaceId: "space-1",
      frameUrls: Array.from({ length: 10 }, (_, i) => `frame-${i}`),
      sampleImageUrls: ["https://example.com/photo-1.jpg", "https://example.com/photo-2.jpg"],
    });

    expect(result.warnings).toEqual(["The room looks poorly lit."]);
  });

  it("only sends real image URLs to the model, never fabricates issues when the model returns an empty array", async () => {
    stubChatResponse(JSON.stringify([]));
    const result = await provider.analyzeScene({
      spaceId: "space-1",
      frameUrls: Array.from({ length: 10 }, (_, i) => `frame-${i}`),
      sampleImageUrls: ["https://example.com/photo-1.jpg"],
    });
    expect(result.warnings).toEqual([]);
  });

  it("degrades to no vision warnings (never crashes) when the vision call fails", async () => {
    stubChatResponse(null, false);
    const result = await provider.analyzeScene({
      spaceId: "space-1",
      frameUrls: Array.from({ length: 10 }, (_, i) => `frame-${i}`),
      sampleImageUrls: ["https://example.com/photo-1.jpg"],
    });
    expect(result.warnings).toEqual([]);
  });

  it("degrades to no vision warnings when the model returns unparseable content", async () => {
    stubChatResponse("looks fine to me!");
    const result = await provider.analyzeScene({
      spaceId: "space-1",
      frameUrls: Array.from({ length: 10 }, (_, i) => `frame-${i}`),
      sampleImageUrls: ["https://example.com/photo-1.jpg"],
    });
    expect(result.warnings).toEqual([]);
  });

  it("never sends more than the sample cap worth of vision requests", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(init.body as string);
        return new Response(JSON.stringify({ choices: [{ message: { content: "[]" } }] }), { status: 200 });
      })
    );

    await provider.analyzeScene({
      spaceId: "space-1",
      frameUrls: Array.from({ length: 10 }, (_, i) => `frame-${i}`),
      sampleImageUrls: ["u1", "u2", "u3", "u4", "u5"],
    });

    expect(calls.length).toBe(2); // MAX_SCENE_VISION_SAMPLES
  });
});

describe("NvidiaAIProvider.generateSpaceDescription", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const provider = new NvidiaAIProvider("fake-key");

  it("returns the model's text when the call succeeds", async () => {
    stubChatResponse("A bright, airy lobby welcoming every guest.");
    const text = await provider.generateSpaceDescription({
      space: space({ name: "Grand Lobby", kind: "LOBBY" }),
      scene: null,
    });
    expect(text).toBe("A bright, airy lobby welcoming every guest.");
  });

  it("falls back to the deterministic template when the call fails", async () => {
    stubChatResponse(null, false);
    const text = await provider.generateSpaceDescription({
      space: space({ name: "Grand Lobby", kind: "LOBBY" }),
      scene: null,
    });
    expect(text).toBe("Grand Lobby — a lobby.");
  });
});
