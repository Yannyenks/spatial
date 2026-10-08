import { describe, expect, it } from "vitest";
import { splatFrameFor } from "@/lib/splat-frame";

describe("splatFrameFor", () => {
  it("flips World Labs worlds out of OpenCV convention and keeps their metric scale", () => {
    const frame = splatFrameFor({
      model: "marble-1.1",
      sceneMetaJson: JSON.stringify({ metricScale: 1.23, groundOffset: 0.42 }),
    });
    expect(frame.rotation).toEqual([1, 0, 0, 0]);
    expect(frame.metric).toEqual({ scale: 1.23, groundOffset: 0.42 });
    expect(frame.originIsCapturePoint).toBe(true);
  });

  it("still orients a World Labs world whose scene metadata is missing", () => {
    const frame = splatFrameFor({ model: "marble-1.1-plus", sceneMetaJson: null });
    expect(frame.rotation).toEqual([1, 0, 0, 0]);
    expect(frame.metric).toBeUndefined();
  });

  it("flips WorldMirror output without inventing a scale", () => {
    const frame = splatFrameFor({ model: "hy-worldmirror-2.0" });
    expect(frame.rotation).toEqual([1, 0, 0, 0]);
    expect(frame.metric).toBeUndefined();
    expect(frame.originIsCapturePoint).toBe(true);
  });

  it("brings nerfstudio's Z-up export to Y-up", () => {
    const frame = splatFrameFor({ model: "nerfstudio-splatfacto" });
    expect(frame.rotation[0]).toBeCloseTo(-Math.SQRT1_2);
    expect(frame.rotation[3]).toBeCloseTo(Math.SQRT1_2);
  });

  it("shows manually uploaded splats as-is", () => {
    expect(splatFrameFor({ model: null }).rotation).toEqual([0, 0, 0, 1]);
  });
});
