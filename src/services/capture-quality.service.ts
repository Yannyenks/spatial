import "server-only";
import sharp from "sharp";
import cvModule from "@techstark/opencv-js";

// Classical computer vision, not a neural model — mature, well-established
// techniques (docs/rd-blueprint-classification.md: "Capture quality
// engine... mature OpenCV-based heuristics... HYBRID, ready to start"),
// running via OpenCV.js (WASM, no native compilation — same reasoning as
// the face-redaction engine) rather than a GPU service, since blur and
// exposure are exactly the kind of signal that doesn't need a neural
// network. Unlike depth estimation, this has no external-billing
// dependency at all.
const ANALYSIS_WIDTH = 800; // normalizes the blur-variance threshold across different capture resolutions

// "Variance of the Laplacian" blur metric (Pech-Pacheco et al., 2000; the
// standard, widely-cited classical technique) — a photo with genuine
// sharp edges has a high-variance Laplacian response; a blurry one is
// smooth and low-variance. This threshold is a commonly-cited starting
// point normalized to an 800px-wide grayscale image, not derived from a
// calibration dataset of our own (none exists yet) — documented as a
// heuristic, not a precisely measured cutoff. Revisit once real usage
// data exists.
const BLUR_VARIANCE_THRESHOLD = 100;
const UNDEREXPOSED_MEAN_THRESHOLD = 40; // out of 255
const OVEREXPOSED_MEAN_THRESHOLD = 215;

export interface CaptureQualityResult {
  blurVariance: number;
  meanBrightness: number;
  isBlurry: boolean;
  isUnderexposed: boolean;
  isOverexposed: boolean;
  warning: string | null;
}

async function getCv() {
  const mod = cvModule as unknown;
  if (mod instanceof Promise) return mod as Awaited<typeof mod>;
  if ((mod as { Mat?: unknown }).Mat) return mod;
  await new Promise<void>((resolve) => {
    (mod as { onRuntimeInitialized: () => void }).onRuntimeInitialized = () => resolve();
  });
  return mod;
}

/**
 * Real blur/exposure analysis on an uploaded photo — never blocks the
 * upload if it fails (corrupt image, OpenCV error): returns null and the
 * caller treats that exactly like "no signal available", the same
 * resilience principle as face redaction's own failure handling.
 */
export async function analyzeCaptureQuality(buffer: Buffer): Promise<CaptureQualityResult | null> {
  try {
    const { data, info } = await sharp(buffer)
      .resize({ width: ANALYSIS_WIDTH, withoutEnlargement: true })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cv = (await getCv()) as any;
    const src = cv.matFromArray(info.height, info.width, cv.CV_8UC1, data);
    const laplacian = new cv.Mat();
    cv.Laplacian(src, laplacian, cv.CV_64F);

    const lapMean = new cv.Mat();
    const lapStdDev = new cv.Mat();
    cv.meanStdDev(laplacian, lapMean, lapStdDev);
    const blurVariance = Math.pow(lapStdDev.data64F[0], 2);

    const srcMean = new cv.Mat();
    const srcStdDev = new cv.Mat();
    cv.meanStdDev(src, srcMean, srcStdDev);
    const meanBrightness = srcMean.data64F[0];

    src.delete();
    laplacian.delete();
    lapMean.delete();
    lapStdDev.delete();
    srcMean.delete();
    srcStdDev.delete();

    const isBlurry = blurVariance < BLUR_VARIANCE_THRESHOLD;
    const isUnderexposed = meanBrightness < UNDEREXPOSED_MEAN_THRESHOLD;
    const isOverexposed = meanBrightness > OVEREXPOSED_MEAN_THRESHOLD;

    let warning: string | null = null;
    if (isBlurry) warning = "This photo looks blurry — consider retaking it for a sharper reconstruction.";
    else if (isUnderexposed) warning = "This photo looks very dark — try retaking it with more light.";
    else if (isOverexposed) warning = "This photo looks overexposed — try retaking it with less direct light.";

    return { blurVariance, meanBrightness, isBlurry, isUnderexposed, isOverexposed, warning };
  } catch {
    return null;
  }
}
