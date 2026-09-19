import * as ort from "onnxruntime-node";
import sharp from "sharp";
import path from "path";
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

// Depth Anything V2 Small (Apache-2.0), int8-quantized ONNX export from the
// "onnx-community" org (the same conversion pipeline transformers.js/ONNX
// Runtime Web/Node consumers already rely on). Run entirely locally via
// onnxruntime-node (prebuilt native binaries, no compilation — same
// constraint-fit as `sharp`/`ffmpeg-static`), unlike ReplicateDepthEngine's
// pay-per-use hosted inference: this is the free-tier alternative
// (docs/free-tier-roadmap.md, step A2), same model family, zero billing.
const MODEL_PATH = path.join(process.cwd(), "models", "depth-estimation", "depth_anything_v2_small_int8.onnx");

// The model rounds height/width down to a multiple of 14 (ViT patch size)
// internally regardless of input size — probed directly against the real
// model before picking this (see git history), not assumed from docs.
// 280 (20*14) keeps CPU inference around ~600ms/photo; the much larger
// "native" 518x518 the model card suggests costs ~2s/photo for no benefit
// here, since only the statistical spread of the output is used, not a
// display-quality depth map.
const INPUT_SIZE = 280;

// Real per-call cost (~400ms one-time session load, cached after; ~600ms
// inference each) — capped so one reconstruction job stays fast even
// stacked with everything else in the pipeline, same reasoning and same
// number as ReplicateDepthEngine's cap.
const MAX_PHOTOS_TO_SAMPLE = 6;

// This model's raw predicted_depth output lives on a completely different
// numeric scale than Replicate's rendered 0-255 greyscale PNG. Naively
// min-max-normalizing each image's own output to 0-255 was tried first and
// rejected: it stretches whatever tiny variation exists to fill the full
// range, so a genuinely flat test image (solid grey, stddev 66.6) came out
// statistically indistinguishable from a real, detailed room photo (stddev
// 64.0) — the opposite of a useful signal. Using the model's raw,
// un-normalized stddev instead and rescaling it onto the same 0-255-ish
// range quality-score.service.ts already expects (so the shared
// DEPTH_STDDEV_FLOOR=10/CEILING=70 there means the same thing regardless of
// engine) does show a real difference: probed against a real photo
// (stddev ~1.09), a solid flat test image (~0.62), and a close crop with
// its own real depth transition (~1.30). Like Replicate's own constants,
// this is a documented starting heuristic from real (if limited) probing,
// not a measured calibration dataset — revisit once real usage data exists.
const RAW_STDDEV_FLOOR = 0.55;
const RAW_STDDEV_CEILING = 1.4;
const OUTPUT_FLOOR = 10;
const OUTPUT_CEILING = 70;

function rescaleStdDev(raw: number): number {
  const t = (raw - RAW_STDDEV_FLOOR) / (RAW_STDDEV_CEILING - RAW_STDDEV_FLOOR);
  return OUTPUT_FLOOR + t * (OUTPUT_CEILING - OUTPUT_FLOOR);
}

interface DepthSample {
  assetId: string;
  depthStdDev: number;
}

let sessionPromise: Promise<ort.InferenceSession> | null = null;
function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) sessionPromise = ort.InferenceSession.create(MODEL_PATH);
  return sessionPromise;
}

const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];

async function preprocess(buffer: Buffer): Promise<Float32Array> {
  const { data } = await sharp(buffer)
    .resize(INPUT_SIZE, INPUT_SIZE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const chw = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;
  for (let y = 0; y < INPUT_SIZE; y++) {
    for (let x = 0; x < INPUT_SIZE; x++) {
      const srcIdx = (y * INPUT_SIZE + x) * 3;
      const dstIdx = y * INPUT_SIZE + x;
      for (let c = 0; c < 3; c++) {
        const v = data[srcIdx + c]! / 255;
        chw[c * plane + dstIdx] = (v - IMAGENET_MEAN[c]!) / IMAGENET_STD[c]!;
      }
    }
  }
  return chw;
}

async function computeDepthStdDev(buffer: Buffer): Promise<number> {
  const session = await getSession();
  const chw = await preprocess(buffer);
  const tensor = new ort.Tensor("float32", chw, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const results = await session.run({ pixel_values: tensor });
  const depth = results.predicted_depth!.data as Float32Array;

  let sum = 0;
  for (let i = 0; i < depth.length; i++) sum += depth[i]!;
  const mean = sum / depth.length;
  let variance = 0;
  for (let i = 0; i < depth.length; i++) variance += (depth[i]! - mean) ** 2;
  variance /= depth.length;
  return rescaleStdDev(Math.sqrt(variance));
}

/**
 * Real monocular depth estimation, run locally (free-tier plan step A2 —
 * docs/free-tier-roadmap.md), same real-vs-placeholder honesty as
 * ReplicateDepthEngine:
 *
 * - Single-image depth gives no camera pose/extrinsics — camera positions
 *   here are still a synthesized placeholder ring, same as every other
 *   engine, not presented as measured geometry.
 * - Video assets aren't covered — only PHOTO assets get a real depth pass.
 * - What IS real: an actual neural network genuinely runs on genuine
 *   photo pixels (locally, via onnxruntime-node — no API call, no
 *   billing), and the quality score's geometry component derives from
 *   real depth-map statistics.
 */
export class LocalDepthEngine implements ReconstructionEngine {
  readonly id = "local-depth";

  async analyze(input: ReconstructionInput): Promise<AnalysisResult> {
    const warnings: string[] = [];
    if (input.assets.length === 0) {
      warnings.push("No media captured for this space yet.");
    }

    const photos = input.assets.filter((a) => a.kind === "PHOTO").slice(0, MAX_PHOTOS_TO_SAMPLE);
    if (photos.length === 0 && input.assets.length > 0) {
      warnings.push("No photos available for depth estimation yet — only video was captured.");
    }

    const cameraPositions: Vector3[] = input.assets.map((_, i) => {
      const angle = (i / Math.max(input.assets.length, 1)) * Math.PI * 2;
      return { x: Math.cos(angle) * 2, y: 1.6, z: Math.sin(angle) * 2 };
    });

    const detectedObjects: SpatialObject[] = [];
    return { detectedObjects, cameraPositions, warnings };
  }

  async reconstruct(input: ReconstructionInput): Promise<ReconstructionResult> {
    const analysis = await this.analyze(input);
    const storage = getStorageProvider();

    const photos = input.assets.filter((a) => a.kind === "PHOTO").slice(0, MAX_PHOTOS_TO_SAMPLE);
    const depthSamples: DepthSample[] = [];
    const depthErrors: string[] = [];

    for (const photo of photos) {
      try {
        const buffer = await storage.getObject(photo.bucket, photo.storageKey);
        const depthStdDev = await computeDepthStdDev(buffer);
        depthSamples.push({ assetId: photo.id, depthStdDev });
      } catch (error) {
        // One photo's inference failing (corrupt image, unexpected format)
        // degrades gracefully to a smaller real sample rather than failing
        // the whole reconstruction — same resilience principle used
        // throughout this pipeline (redaction, capture quality, Replicate).
        depthErrors.push(error instanceof Error ? error.message : String(error));
      }
    }

    const scene: Scene = {
      id: `depth-scene-${input.spaceId}`,
      spaceId: input.spaceId,
      objects: analysis.detectedObjects,
      cameraPositions: analysis.cameraPositions,
      navigationPoints: analysis.cameraPositions,
      metadata: {
        engine: this.id,
        assetCount: input.assets.length,
        depthSampledCount: depthSamples.length,
        depthAverageStdDev:
          depthSamples.length > 0
            ? depthSamples.reduce((sum, s) => sum + s.depthStdDev, 0) / depthSamples.length
            : null,
        depthErrors: depthErrors.length > 0 ? depthErrors : undefined,
      },
    };

    const key = `${input.projectId}/${input.spaceId}/scene.json`;
    const ref = await storage.putObject({
      bucket: "reconstruction",
      key,
      data: Buffer.from(JSON.stringify(scene, null, 2)),
      contentType: "application/json",
    });

    return { outputUri: ref.url, method: "DEPTH_BASED", scene };
  }

  async optimize(_input: OptimizationInput): Promise<OptimizationResult> {
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
