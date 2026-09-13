import type { VideoGenerationInput, VideoGenerationJob, VideoGenerationStatusValue } from "@/types";
import type { VideoGenerationProvider } from "./types";

/**
 * MOCK video generation provider (§33).
 *
 * Does not call any real video model. It simulates the async job lifecycle
 * (QUEUED -> PROCESSING -> COMPLETED) so the AI Studio UI and job-status
 * polling can be built and tested now, and swapped for a real provider
 * (e.g. a commercial text/image-to-video API) later without UI changes.
 * It never claims to have produced real footage: `outputUrl` stays null,
 * and callers must render "not available" state rather than fabricate a
 * video preview.
 */
export class MockVideoGenerationProvider implements VideoGenerationProvider {
  readonly id = "mock";
  private jobs = new Map<string, VideoGenerationStatusValue>();

  async generate(input: VideoGenerationInput): Promise<VideoGenerationJob> {
    const id = `mock-video-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    this.jobs.set(id, "QUEUED");

    // Simulate async processing without blocking the caller (§3).
    setTimeout(() => this.jobs.set(id, "PROCESSING"), 500);
    setTimeout(() => this.jobs.set(id, "COMPLETED"), 3000);

    return {
      id,
      projectId: input.projectId,
      provider: this.id,
      status: "QUEUED",
      input,
      outputUrl: null,
      error: null,
      createdAt: new Date().toISOString(),
    };
  }

  async getStatus(jobId: string): Promise<VideoGenerationStatusValue> {
    return this.jobs.get(jobId) ?? "FAILED";
  }
}
