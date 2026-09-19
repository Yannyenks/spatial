import type { AIProvider } from "./types";
import { MockAIProvider } from "./mock-ai-provider";
import { NvidiaAIProvider } from "./nvidia-ai-provider";

export type { AIProvider } from "./types";

let cached: AIProvider | null = null;

/**
 * Resolves the configured AI provider — "mock" (default) or "nvidia"
 * (real LLM-backed intent parsing + description generation via NVIDIA's
 * hosted NIM catalog, see nvidia-ai-provider.ts). No other file in the
 * app needs to change to swap providers (§12, §32, docs/ai-pipeline.md).
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;
  const kind = process.env.AI_PROVIDER ?? "mock";
  switch (kind) {
    case "nvidia": {
      const apiKey = process.env.NVIDIA_API_KEY;
      if (!apiKey) {
        throw new Error("NVIDIA_API_KEY is not set. Copy .env.example to .env and set a real value.");
      }
      cached = new NvidiaAIProvider(apiKey, process.env.NVIDIA_MODEL, process.env.NVIDIA_VISION_MODEL);
      return cached;
    }
    case "mock":
    default:
      cached = new MockAIProvider();
      return cached;
  }
}
