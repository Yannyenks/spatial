import type { ReconstructionEngine } from "./types";
import { MockReconstructionEngine } from "./mock-reconstruction-engine";
import { ReplicateDepthEngine } from "./replicate-depth-engine";
import { LocalDepthEngine } from "./local-depth-engine";

export type { ReconstructionEngine } from "./types";

let cached: ReconstructionEngine | null = null;

/**
 * Resolves the configured reconstruction engine — "mock" (default),
 * "replicate" (real monocular depth estimation, pay-per-use hosted
 * inference, see replicate-depth-engine.ts) or "local-depth" (the same
 * model family run locally and free via onnxruntime-node, see
 * local-depth-engine.ts — docs/free-tier-roadmap.md step A2). A full
 * SLAM/mesh/Gaussian-Splatting engine registers here the same way when it
 * exists; no other file in the app needs to change (§12, §32).
 */
export function getReconstructionEngine(): ReconstructionEngine {
  if (cached) return cached;
  const kind = process.env.RECONSTRUCTION_PROVIDER ?? "mock";
  switch (kind) {
    case "replicate": {
      const token = process.env.REPLICATE_API_TOKEN;
      if (!token) {
        throw new Error("REPLICATE_API_TOKEN is not set. Copy .env.example to .env and set a real value.");
      }
      cached = new ReplicateDepthEngine(token);
      return cached;
    }
    case "local-depth":
      cached = new LocalDepthEngine();
      return cached;
    case "mock":
    default:
      cached = new MockReconstructionEngine();
      return cached;
  }
}
