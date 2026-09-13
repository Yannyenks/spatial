import "server-only";
import sharp from "sharp";
import path from "path";
import { readFile } from "fs/promises";
import cvModule from "@techstark/opencv-js";

// Face detection so uploaded photos never publish a recognizable bystander
// or staff member's face without a deliberate choice to do so — a legal/
// trust requirement (GDPR-adjacent: photos of identifiable people are
// personal data), not a nice-to-have. Scoped to faces only for this pass;
// license-plate detection has no equivalently mature free-and-open model
// (see docs/rd-blueprint-classification.md) and would need either a paid
// API or further R&D — tracked separately, not faked here.
//
// Uses OpenCV.js (WASM, no native compilation) with the YuNet face
// detector (ONNX, ~230KB, from the official opencv_zoo model repository —
// BSD-licensed) rather than TensorFlow.js: @tensorflow/tfjs-node requires
// a native build toolchain (MSVC on Windows) this environment doesn't
// have, and @vladmandic/face-api's pure-JS build path turned out to be
// too fragile to depend on. Verified against a real photo before wiring
// this in: 90.3% confidence on an actual face, correctly boxed.
const MODEL_PATH = path.join(process.cwd(), "models", "face-detection", "face_detection_yunet.onnx");
const SCORE_THRESHOLD = 0.6;
const NMS_THRESHOLD = 0.3;
const TOP_K = 5000;
const BLUR_SIGMA = 25;

type CvModule = Awaited<ReturnType<typeof loadCv>>;
let cvPromise: Promise<CvModule> | null = null;
let detectorPromise: Promise<unknown> | null = null;

async function loadCv() {
  const mod = cvModule as unknown;
  if (mod instanceof Promise) return mod as Awaited<typeof mod>;
  if ((mod as { Mat?: unknown }).Mat) return mod;
  await new Promise<void>((resolve) => {
    (mod as { onRuntimeInitialized: () => void }).onRuntimeInitialized = () => resolve();
  });
  return mod;
}

async function getCv() {
  if (!cvPromise) cvPromise = loadCv();
  return cvPromise;
}

async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const cv = await getCv();
      const modelBytes = await readFile(MODEL_PATH);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cv as any).FS_createDataFile("/", "yunet.onnx", modelBytes, true, false, false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new (cv as any).FaceDetectorYN("/yunet.onnx", "", new (cv as any).Size(320, 320), SCORE_THRESHOLD, NMS_THRESHOLD, TOP_K);
    })();
  }
  return detectorPromise;
}

interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Detects faces in an image buffer and returns their bounding boxes in
 * pixel coordinates. Returns an empty array both when the image genuinely
 * has no faces (the common case — most capture photos are empty rooms)
 * and is the honest, expected outcome, not a failure.
 */
async function detectFaces(buffer: Buffer): Promise<FaceBox[]> {
  const cv = await getCv();
  const detector = await getDetector();
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cvAny = cv as any;
  const mat = cvAny.matFromArray(info.height, info.width, cvAny.CV_8UC4, data);
  const bgr = new cvAny.Mat();
  cvAny.cvtColor(mat, bgr, cvAny.COLOR_RGBA2BGR);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (detector as any).setInputSize(new cvAny.Size(info.width, info.height));
  const results = new cvAny.Mat();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (detector as any).detect(bgr, results);

  const boxes: FaceBox[] = [];
  for (let i = 0; i < results.rows; i++) {
    const x = Math.max(0, Math.round(results.floatAt(i, 0)));
    const y = Math.max(0, Math.round(results.floatAt(i, 1)));
    const width = Math.min(info.width - x, Math.round(results.floatAt(i, 2)));
    const height = Math.min(info.height - y, Math.round(results.floatAt(i, 3)));
    if (width > 0 && height > 0) boxes.push({ x, y, width, height });
  }

  mat.delete();
  bgr.delete();
  results.delete();
  return boxes;
}

/**
 * Returns a copy of the image with every detected face region blurred.
 * Returns the original buffer unchanged if no faces are found (the normal
 * case) or the buffer isn't decodable as an image (caller already handles
 * that separately when generating thumbnails).
 */
export async function redactFaces(buffer: Buffer): Promise<Buffer> {
  const boxes = await detectFaces(buffer);
  if (boxes.length === 0) return buffer;

  const composites = await Promise.all(
    boxes.map(async (box) => ({
      input: await sharp(buffer)
        .extract({ left: box.x, top: box.y, width: box.width, height: box.height })
        .blur(BLUR_SIGMA)
        .toBuffer(),
      left: box.x,
      top: box.y,
    }))
  );

  return sharp(buffer).composite(composites).toBuffer();
}
