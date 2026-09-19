import type { QualityScore } from "@/types";

const RECOMMENDED_ASSET_COUNT = 24;
const MIN_ASSET_COUNT = 8;

// Calibration for real depth-map statistics (ReplicateDepthEngine): the
// standard deviation of a grayscale depth image's pixel values (0-255).
// A photo of a flat, close-up surface has low variance; a photo that
// actually captures a room's near-to-far extent has high variance. These
// thresholds are a starting heuristic — reasonable, not derived from a
// calibration dataset (none exists yet) — and are documented as such
// rather than presented as a precisely measured scale. Revisit once real
// usage data exists (execution-plan's own "benchmark suite" item).
const DEPTH_STDDEV_FLOOR = 10; // ~flat surface, near-zero real spatial signal
const DEPTH_STDDEV_CEILING = 70; // a well-captured room with real depth range

/**
 * Quality score (§22). Every sub-score here is computed from real,
 * inspectable inputs — never a random or hardcoded number (§33).
 *
 * `depthAverageStdDev`/`depthSampledCount` are optional: when a real
 * reconstruction engine (ReplicateDepthEngine) supplies them, the
 * geometry sub-score is derived from actual depth-map statistics instead
 * of the coverage-only heuristic below. Absent (mock engine, or every
 * depth call in a job failed), it falls back to the original
 * asset-count-based estimate — an honest degradation, not a silent gap.
 *
 * `visualQualityFlaggedCount`/`visualQualitySampledCount` are the same
 * idea applied to per-photo blur/exposure analysis
 * (capture-quality.service.ts, recorded on Asset at upload time): when
 * present, visualQuality reflects the real fraction of clean photos
 * instead of a pure coverage-based guess.
 */
export function computeQualityScore(input: {
  assetCount: number;
  hasReconstructionOutput: boolean;
  hotspotCount: number;
  connectionCount: number;
  depthAverageStdDev?: number | null;
  depthSampledCount?: number;
  visualQualityFlaggedCount?: number;
  visualQualitySampledCount?: number;
}): QualityScore {
  const coverage = Math.min(100, Math.round((input.assetCount / RECOMMENDED_ASSET_COUNT) * 100));

  const hasRealDepthSignal =
    input.hasReconstructionOutput &&
    typeof input.depthAverageStdDev === "number" &&
    (input.depthSampledCount ?? 0) > 0;

  const geometry = hasRealDepthSignal
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            ((input.depthAverageStdDev! - DEPTH_STDDEV_FLOOR) / (DEPTH_STDDEV_CEILING - DEPTH_STDDEV_FLOOR)) * 100
          )
        )
      )
    : input.hasReconstructionOutput
      ? Math.min(100, 60 + coverage * 0.4)
      : 0;

  const hasRealVisualQualitySignal = input.hasReconstructionOutput && (input.visualQualitySampledCount ?? 0) > 0;
  const cleanFraction = hasRealVisualQualitySignal
    ? 1 - (input.visualQualityFlaggedCount ?? 0) / input.visualQualitySampledCount!
    : null;

  const visualQuality = hasRealVisualQualitySignal
    ? Math.round(cleanFraction! * 100)
    : input.hasReconstructionOutput
      ? Math.min(100, 50 + coverage * 0.5)
      : 0;
  const navigation = Math.min(100, input.hotspotCount * 15 + input.connectionCount * 20);

  const overall = Math.round((coverage + geometry + visualQuality + navigation) / 4);

  const recommendations: string[] = [];
  if (input.assetCount < MIN_ASSET_COUNT) {
    recommendations.push("Capture more images or a longer walkthrough video — coverage is low.");
  }
  if (input.connectionCount === 0) {
    recommendations.push("Connect this space to at least one neighboring space so visitors can navigate.");
  }
  if (input.hotspotCount === 0) {
    recommendations.push("Add at least one hotspot so visitors have something to interact with.");
  }
  if (hasRealDepthSignal && input.depthAverageStdDev! < DEPTH_STDDEV_FLOOR) {
    recommendations.push("Captured photos show little depth variation — try including more of the room, not just close-ups.");
  }
  if (hasRealVisualQualitySignal && (input.visualQualityFlaggedCount ?? 0) > 0) {
    recommendations.push(
      `${input.visualQualityFlaggedCount} of ${input.visualQualitySampledCount} photo(s) look blurry, too dark, or overexposed — consider retaking them for a cleaner reconstruction.`
    );
  }

  return {
    overall,
    geometry: Math.round(geometry),
    coverage,
    visualQuality: Math.round(visualQuality),
    navigation: Math.round(navigation),
    recommendations,
  };
}
