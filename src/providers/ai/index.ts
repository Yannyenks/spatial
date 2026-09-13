import type { AIProvider } from "./types";
import { MockAIProvider } from "./mock-ai-provider";

export type { AIProvider } from "./types";

let cached: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (cached) return cached;
  const kind = process.env.AI_PROVIDER ?? "mock";
  switch (kind) {
    case "mock":
    default:
      cached = new MockAIProvider();
      return cached;
  }
}
