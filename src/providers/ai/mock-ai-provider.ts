import type { AgentTurn, Scene, Space, SpatialRelation } from "@/types";
import type { AIProvider, SpaceEdge } from "./types";
import { parseIntentDeterministic, executeIntent } from "./concierge-intent";

/**
 * MOCK AI provider (§33 of the platform spec).
 *
 * No LLM or vision model is called here. `answerConciergeQuestion`
 * implements the R&D blueprint's Agent Architecture (§22) honestly for a
 * system with no real language model configured:
 *
 *   question -> parseIntentDeterministic() [regex, NOT an LLM] ->
 *   executeIntent() [typed tool call against the real spatial graph] ->
 *   validated AgentAction[]
 *
 * See `nvidia-ai-provider.ts` for the real-LLM implementation, which
 * swaps only the first step (a model decides the intent instead of a
 * regex) and reuses `executeIntent` unchanged — the tool execution is
 * never delegated to a model, real or mock.
 */
export class MockAIProvider implements AIProvider {
  readonly id = "mock";

  async analyzeScene(input: { spaceId: string; frameUrls: string[]; sampleImageUrls?: string[] }): Promise<{
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
    const intent = parseIntentDeterministic(input.question);
    const actions = executeIntent(intent, input);
    return { question: input.question, actions };
  }
}
