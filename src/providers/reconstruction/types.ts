import type {
  AnalysisResult,
  OptimizationInput,
  OptimizationResult,
  ReconstructionInput,
  ReconstructionResult,
} from "@/types";

/**
 * Reconstruction engine abstraction (§12). The frontend and services never
 * depend on a specific reconstruction technology — Gaussian Splatting,
 * NeRF, photogrammetry, mesh reconstruction, depth-based, or a future
 * proprietary model can all be implemented behind this interface.
 */
export interface ReconstructionEngine {
  readonly id: string;
  analyze(input: ReconstructionInput): Promise<AnalysisResult>;
  reconstruct(input: ReconstructionInput): Promise<ReconstructionResult>;
  optimize(input: OptimizationInput): Promise<OptimizationResult>;
}
