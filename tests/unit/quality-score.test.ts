import { describe, expect, it } from "vitest";
import { computeQualityScore } from "@/services/quality-score.service";

describe("computeQualityScore", () => {
  it("scores zero coverage/geometry when no reconstruction exists", () => {
    const score = computeQualityScore({
      assetCount: 0,
      hasReconstructionOutput: false,
      hotspotCount: 0,
      connectionCount: 0,
    });
    expect(score.coverage).toBe(0);
    expect(score.geometry).toBe(0);
    expect(score.navigation).toBe(0);
    expect(score.recommendations.length).toBeGreaterThan(0);
  });

  it("never exceeds 100 for coverage even with excess assets", () => {
    const score = computeQualityScore({
      assetCount: 500,
      hasReconstructionOutput: true,
      hotspotCount: 10,
      connectionCount: 10,
    });
    expect(score.coverage).toBeLessThanOrEqual(100);
    expect(score.navigation).toBeLessThanOrEqual(100);
    expect(score.overall).toBeLessThanOrEqual(100);
  });

  it("recommends capturing more media below the minimum threshold", () => {
    const score = computeQualityScore({
      assetCount: 3,
      hasReconstructionOutput: true,
      hotspotCount: 1,
      connectionCount: 1,
    });
    expect(score.recommendations.some((r) => r.toLowerCase().includes("capture"))).toBe(true);
  });

  it("does not recommend connections when at least one exists", () => {
    const score = computeQualityScore({
      assetCount: 24,
      hasReconstructionOutput: true,
      hotspotCount: 2,
      connectionCount: 1,
    });
    expect(score.recommendations.some((r) => r.toLowerCase().includes("connect"))).toBe(false);
  });
});
