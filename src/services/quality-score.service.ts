import type { QualityScore } from "@/types";

const RECOMMENDED_ASSET_COUNT = 24;
const MIN_ASSET_COUNT = 8;

/**
 * Quality score (§22). Every sub-score here is computed from real,
 * inspectable inputs (asset count, presence of a reconstruction output,
 * hotspot/navigation coverage) — never a random or hardcoded number
 * (§33). It is intentionally simple today; a real reconstruction engine
 * can later feed richer geometry/visual metrics into the same shape.
 */
export function computeQualityScore(input: {
  assetCount: number;
  hasReconstructionOutput: boolean;
  hotspotCount: number;
  connectionCount: number;
}): QualityScore {
  const coverage = Math.min(100, Math.round((input.assetCount / RECOMMENDED_ASSET_COUNT) * 100));
  const geometry = input.hasReconstructionOutput ? Math.min(100, 60 + coverage * 0.4) : 0;
  const visualQuality = input.hasReconstructionOutput ? Math.min(100, 50 + coverage * 0.5) : 0;
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

  return {
    overall,
    geometry: Math.round(geometry),
    coverage,
    visualQuality: Math.round(visualQuality),
    navigation: Math.round(navigation),
    recommendations,
  };
}
