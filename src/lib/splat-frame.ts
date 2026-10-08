// How a stored splat's coordinates map onto the viewer's Y-up, metres-
// when-known world. Every engine writes its own convention (see
// SPLAT_ENGINES in services/splat-training.service.ts), and a wrong guess
// leaves the visitor staring at empty space - so it's derived from which
// model produced the reconstruction, not assumed.

export interface SplatFrame {
  /** Quaternion [x, y, z, w] applied to the scene on load. */
  rotation: [number, number, number, number];
  /** Raw units -> metres and the ground plane, when the engine reports them. */
  metric?: { scale: number; groundOffset: number };
  /** The world's origin is where the first photo was taken, facing its view. */
  originIsCapturePoint: boolean;
}

const IDENTITY: [number, number, number, number] = [0, 0, 0, 1];
// Nerfstudio exports Z-up: -90deg about X brings Z to Y.
const Z_UP_TO_Y_UP: [number, number, number, number] = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
// OpenCV camera convention (Y down, Z forward), used by WorldMirror and
// World Labs Marble: 180deg about X, per World Labs' own rendering guide.
const OPENCV_TO_Y_UP: [number, number, number, number] = [1, 0, 0, 0];

export function splatFrameFor(reconstruction: { model?: string | null; sceneMetaJson?: string | null }): SplatFrame {
  const model = reconstruction.model ?? "";
  if (model.startsWith("marble")) {
    let meta: { metricScale?: number; groundOffset?: number } = {};
    try {
      meta = reconstruction.sceneMetaJson ? JSON.parse(reconstruction.sceneMetaJson) : {};
    } catch {
      // Fall through to the unscaled frame.
    }
    return {
      rotation: OPENCV_TO_Y_UP,
      metric:
        typeof meta.metricScale === "number"
          ? { scale: meta.metricScale, groundOffset: meta.groundOffset ?? 0 }
          : undefined,
      originIsCapturePoint: true,
    };
  }
  if (model.startsWith("hy-worldmirror")) return { rotation: OPENCV_TO_Y_UP, originIsCapturePoint: true };
  if (model.startsWith("nerfstudio")) return { rotation: Z_UP_TO_Y_UP, originIsCapturePoint: false };
  // Manually uploaded splats: unknown convention, shown as-is.
  return { rotation: IDENTITY, originIsCapturePoint: false };
}
