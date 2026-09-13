import type { VideoGenerationProvider } from "./types";
import { MockVideoGenerationProvider } from "./mock-video-provider";

export type { VideoGenerationProvider } from "./types";

let cached: VideoGenerationProvider | null = null;

export function getVideoProvider(): VideoGenerationProvider {
  if (cached) return cached;
  const kind = process.env.VIDEO_PROVIDER ?? "mock";
  switch (kind) {
    case "mock":
    default:
      cached = new MockVideoGenerationProvider();
      return cached;
  }
}
