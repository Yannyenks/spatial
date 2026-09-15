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

  it("derives geometry from real depth stats when a real engine supplies them", () => {
    const flatSurface = computeQualityScore({
      assetCount: 24,
      hasReconstructionOutput: true,
      hotspotCount: 1,
      connectionCount: 1,
      depthAverageStdDev: 5, // below the floor — near-zero real spatial signal
      depthSampledCount: 4,
    });
    const wellCapturedRoom = computeQualityScore({
      assetCount: 24,
      hasReconstructionOutput: true,
      hotspotCount: 1,
      connectionCount: 1,
      depthAverageStdDev: 70, // at the ceiling — real depth range captured
      depthSampledCount: 4,
    });
    expect(flatSurface.geometry).toBeLessThan(wellCapturedRoom.geometry);
    expect(wellCapturedRoom.geometry).toBe(100);
    expect(flatSurface.recommendations.some((r) => r.toLowerCase().includes("depth variation"))).toBe(true);
  });

  it("falls back to the count-based estimate when no real depth samples exist", () => {
    const withoutDepth = computeQualityScore({
      assetCount: 24,
      hasReconstructionOutput: true,
      hotspotCount: 1,
      connectionCount: 1,
    });
    const withZeroSamples = computeQualityScore({
      assetCount: 24,
      hasReconstructionOutput: true,
      hotspotCount: 1,
      connectionCount: 1,
      depthAverageStdDev: 70,
      depthSampledCount: 0, // every depth call failed — no real signal despite the field being present
    });
    expect(withZeroSamples.geometry).toBe(withoutDepth.geometry);
  });
});
