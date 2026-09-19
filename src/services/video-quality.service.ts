import "server-only";
import { spawn } from "child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import ffmpegPath from "ffmpeg-static";
import { analyzeCaptureQuality } from "@/services/capture-quality.service";

// Samples a handful of frames from the first ~24 seconds of an uploaded
// walkthrough video (SAMPLE_INTERVAL_SECONDS * MAX_SAMPLES) and reuses the
// same classical blur/exposure analysis built for photos
// (capture-quality.service.ts) on each one — an honest scope limit for a
// longer clip, not a full scan, the same tradeoff already made for the
// depth engine's 6-photo cap. No neural inference here (unlike face
// redaction), so per-frame cost is milliseconds, not hundreds of
// milliseconds — this stays well within a serverless function's timeout
// even for the whole sample set.
const SAMPLE_INTERVAL_SECONDS = 3;
const MAX_SAMPLES = 8;

// If at least half the sampled frames show a real quality problem, the
// video as a whole is treated as flagged — one bad frame in eight is
// normal (a brief pan), most of them being bad points at real shakiness,
// poor lighting, or focus issues.
const FLAGGED_FRACTION_WARNING_THRESHOLD = 0.5;

export interface VideoQualityResult {
  sampledFrames: number;
  flaggedFrames: number;
  warning: string | null;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg binary is not available on this platform."));
      return;
    }
    const proc = spawn(ffmpegPath, args);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });
  });
}

/**
 * Real blur/exposure analysis on a sample of an uploaded video's frames.
 * Never blocks the upload if it fails (missing ffmpeg binary on this
 * platform, corrupt/unsupported video bytes): returns null, treated the
 * same as "no signal available" everywhere else in this pipeline.
 */
export async function analyzeVideoQuality(buffer: Buffer): Promise<VideoQualityResult | null> {
  let dir: string | null = null;
  try {
    dir = await mkdtemp(path.join(tmpdir(), "video-quality-"));
    const inputPath = path.join(dir, "input.mp4");
    await writeFile(inputPath, buffer);

    const framePattern = path.join(dir, "frame-%02d.jpg");
    await runFfmpeg([
      "-y",
      "-i", inputPath,
      "-vf", `fps=1/${SAMPLE_INTERVAL_SECONDS}`,
      "-frames:v", String(MAX_SAMPLES),
      framePattern,
    ]);

    const frameFiles = (await readdir(dir)).filter((f) => f.startsWith("frame-")).sort();
    if (frameFiles.length === 0) return null;

    let flaggedFrames = 0;
    for (const file of frameFiles) {
      const frameBuffer = await readFile(path.join(dir, file));
      const quality = await analyzeCaptureQuality(frameBuffer);
      if (quality?.isBlurry || quality?.isUnderexposed || quality?.isOverexposed) flaggedFrames++;
    }

    const sampledFrames = frameFiles.length;
    const warning =
      flaggedFrames / sampledFrames >= FLAGGED_FRACTION_WARNING_THRESHOLD
        ? "This video looks shaky, blurry, or poorly lit in several sampled frames — consider recording a steadier walkthrough with more light."
        : null;

    return { sampledFrames, flaggedFrames, warning };
  } catch {
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
