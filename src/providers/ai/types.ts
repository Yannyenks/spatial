import type { AgentAction, AgentTurn, Scene, Space, SpatialRelation } from "@/types";

/** Minimal navigation edge shape the concierge needs for distance queries — no full Prisma row. */
export interface SpaceEdge {
  fromSpaceId: string;
  toSpaceId: string;
}

/**
 * AI provider abstraction (§16, §32). Every capability an LLM/agent could
 * plug in is a typed method here — nothing in the app calls a model API
 * directly. This keeps the concierge safe (§16: "never let an LLM execute
 * arbitrary commands") because callers only ever receive typed, validated
 * `AgentAction`s from `answerConciergeQuestion`, never raw text to `eval`.
 */
export interface AIProvider {
  readonly id: string;

  /** Scene understanding pass used during reconstruction (§10). */
  analyzeScene(input: { spaceId: string; frameUrls: string[] }): Promise<{
    warnings: string[];
  }>;

  /** Generates a short marketing description for a space (§18). */
  generateSpaceDescription(input: { space: Space; scene: Scene | null }): Promise<string>;

  /**
   * AI concierge (§16, §17; R&D blueprint §21-§22: "the LLM is the
   * interface, not the spatial engine"). Implementations must route
   * questions through real graph/relation lookups over `spaces`,
   * `relations` and `connections` — never invent a room, a relation, or a
   * distance that isn't backed by this data — and return only typed,
   * pre-validated `AgentAction`s, never free-form commands.
   */
  answerConciergeQuestion(input: {
    question: string;
    spaces: Space[];
    relations: SpatialRelation[];
    connections: SpaceEdge[];
  }): Promise<AgentTurn>;
}

export type { AgentAction };
