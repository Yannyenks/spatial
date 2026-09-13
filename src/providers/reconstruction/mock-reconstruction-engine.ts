import type {
  AnalysisResult,
  OptimizationInput,
  OptimizationResult,
  QualityScore,
  ReconstructionInput,
  ReconstructionResult,
  Scene,
  SpatialObject,
  Vector3,
} from "@/types";
import { getStorageProvider } from "@/providers/storage";
import type { ReconstructionEngine } from "./types";

/**
 * MOCK reconstruction engine (§33).
 *
 * This does NOT run any real computer-vision or neural-reconstruction
 * model. It exists so the full pipeline (upload -> analyze -> reconstruct
 * -> optimize -> publish) is real and testable end-to-end before a real
 * engine (Gaussian Splatting, NeRF, photogrammetry, ...) is plugged in
 * behind the same `ReconstructionEngine` interface.
 *
 * To stay honest with users (§33, §10): every number this class returns is
 * derived from real inputs (asset count, asset kinds) rather than being a
 * random or hardcoded "AI processing 87%"-style fake progress value. The
 * quality heuristic is intentionally simple and clearly attributable to
 * "capture coverage", not to any claim of visual analysis.
 */
export class MockReconstructionEngine implements ReconstructionEngine {
  readonly id = "mock";

  async analyze(input: ReconstructionInput): Promise<AnalysisResult> {
    const warnings: string[] = [];
    if (input.assets.length === 0) {
      warnings.push("No media captured for this space yet.");
    }
    if (input.assets.length > 0 && input.assets.length < 8) {
      warnings.push(
        "Fewer than 8 images/frames were provided. Coverage of this space may be incomplete."
      );
    }

    // Deterministic placeholder camera path: without a real structure-from-
    // motion step we cannot recover true camera poses, so we synthesize an
    // evenly spaced ring — enough to drive a navigation UI, explicitly not
    // presented anywhere as measured geometry.
    const cameraPositions: Vector3[] = input.assets.map((_, i) => {
      const angle = (i / Math.max(input.assets.length, 1)) * Math.PI * 2;
      return { x: Math.cos(angle) * 2, y: 1.6, z: Math.sin(angle) * 2 };
    });

    const detectedObjects: SpatialObject[] = [];

    return { detectedObjects, cameraPositions, warnings };
  }

  async reconstruct(input: ReconstructionInput): Promise<ReconstructionResult> {
    const analysis = await this.analyze(input);

    const scene: Scene = {
      id: `mock-scene-${input.spaceId}`,
      spaceId: input.spaceId,
      objects: analysis.detectedObjects,
      cameraPositions: analysis.cameraPositions,
      navigationPoints: analysis.cameraPositions,
      metadata: { engine: this.id, assetCount: input.assets.length },
    };

    const storage = getStorageProvider();
    const key = `${input.projectId}/${input.spaceId}/scene.json`;
    const ref = await storage.putObject({
      bucket: "reconstruction",
      key,
      data: Buffer.from(JSON.stringify(scene, null, 2)),
      contentType: "application/json",
    });

    return { outputUri: ref.url, method: "MOCK", scene };
  }

  async optimize(_input: OptimizationInput): Promise<OptimizationResult> {
    // No separate optimization pass exists for the mock engine; quality is
    // computed by the QualityScoreService from real asset/coverage data,
    // not here. This method is kept to satisfy the interface contract for
    // future engines that do have a distinct optimization step.
    const qualityScore: QualityScore = {
      overall: 0,
      geometry: 0,
      coverage: 0,
      visualQuality: 0,
      navigation: 0,
      recommendations: [],
    };
    return { qualityScore, optimizedOutputUri: "" };
  }
}
