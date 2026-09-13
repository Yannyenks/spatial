import type { ReconstructionEngine } from "./types";
import { MockReconstructionEngine } from "./mock-reconstruction-engine";

export type { ReconstructionEngine } from "./types";

let cached: ReconstructionEngine | null = null;

/**
 * Resolves the configured reconstruction engine. Today only "mock" exists;
 * a real engine (Gaussian Splatting, NeRF, photogrammetry, ...) registers
 * here under its own id and RECONSTRUCTION_PROVIDER picks it — no other
 * file in the app needs to change (§12, §32).
 */
export function getReconstructionEngine(): ReconstructionEngine {
  if (cached) return cached;
  const kind = process.env.RECONSTRUCTION_PROVIDER ?? "mock";
  switch (kind) {
    case "mock":
    default:
      cached = new MockReconstructionEngine();
      return cached;
  }
}
