import type { VideoGenerationInput, VideoGenerationJob, VideoGenerationStatusValue } from "@/types";

/**
 * Generative video provider abstraction (§19). Generation must be
 * conditioned on the Digital Twin's own data (space names, cover assets)
 * to keep marketing output consistent with the real property — never
 * generic stock output — which is why `generate` takes the full
 * `VideoGenerationInput` rather than a free-text prompt only.
 */
export interface VideoGenerationProvider {
  readonly id: string;
  generate(input: VideoGenerationInput): Promise<VideoGenerationJob>;
  getStatus(jobId: string): Promise<VideoGenerationStatusValue>;
}
