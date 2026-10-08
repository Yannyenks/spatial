"use client";

import { useEffect, useRef, useState } from "react";
import type { SplatFrame } from "@/lib/splat-frame";

// Real 3D Gaussian Splat rendering (free-tier plan step B2 —
// docs/free-tier-roadmap.md) via @mkkellogg/gaussian-splats-3d, a
// maintained open-source Three.js-based renderer — reusing an existing
// WebGL splat renderer rather than building one from scratch
// (docs/rd-blueprint-classification.md's own call on this).
//
// Loaded dynamically inside an effect, never imported at module scope:
// the library touches WebGL/Worker/WASM at Viewer-construction time, and
// this component's server-rendered pass (it's a client component, but
// Next still renders it once on the server for the initial HTML) must
// never evaluate that.
const DEFAULT_VIEWER_HEIGHT = 480;
const MOVE_SPEED = 3; // units/second, until the scene's real size is measured
// Metric worlds (World Labs reports scale + ground plane): a standing
// adult's eye height and an unhurried walking pace.
const EYE_HEIGHT_M = 1.6;
const WALK_SPEED_M = 1.4;
// Each engine writes its own coordinate convention (lib/splat-frame.ts);
// the scene is reoriented on load, then the camera is placed from the
// capture point or the scene's measured bounds - never fixed coordinates,
// which can sit entirely outside a real scene (a black screen, seen live).
const DEFAULT_FRAME: SplatFrame = { rotation: [0, 0, 0, 1], originIsCapturePoint: false };
const KEY_TO_ACTION: Record<string, "forward" | "back" | "left" | "right"> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

type SceneBounds = { center: [number, number, number]; size: [number, number, number]; floorY: number };

// 5th-95th percentile bounds over a sample of splat centers, so stray
// floater splats far from the scene don't skew where the camera starts
// or how fast it moves.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function measureScene(splatMesh: any, THREE: any): SceneBounds | null {
  const count: number = splatMesh?.getSplatCount?.() ?? 0;
  if (!count) return null;
  const stride = Math.max(1, Math.floor(count / 20000));
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  const center = new THREE.Vector3();
  for (let i = 0; i < count; i += stride) {
    splatMesh.getSplatCenter(i, center, true);
    xs.push(center.x);
    ys.push(center.y);
    zs.push(center.z);
  }
  for (const values of [xs, ys, zs]) values.sort((a, b) => a - b);
  const at = (values: number[], q: number) => values[Math.floor((values.length - 1) * q)] ?? 0;
  const lo = [at(xs, 0.05), at(ys, 0.05), at(zs, 0.05)] as const;
  const hi = [at(xs, 0.95), at(ys, 0.95), at(zs, 0.95)] as const;
  return {
    center: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2],
    size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]],
    floorY: lo[1],
  };
}

/**
 * `controls="walk"` (public visitor experience) gives real first-person
 * navigation — WASD + mouse-look via THREE.PointerLockControls, "walk
 * through it like a video game" rather than orbiting an object. This
 * library's own built-in controls are orbit-only (confirmed against its
 * real docs before building this - no walk-through mode exists there),
 * but it explicitly supports supplying your own camera + disabling
 * useBuiltInControls, which is what this hooks into.
 *
 * `controls="orbit"` (default; internal dashboard preview) keeps the
 * library's own built-in controls, which already work with touch
 * out of the box - simplest correct choice for a quick admin check.
 *
 * Pointer-lock + keyboard is inherently a desktop/mouse+keyboard
 * pattern with no touch equivalent, so "walk" falls back to the same
 * built-in orbit controls on touch devices rather than silently doing
 * nothing - real free-roam touch controls (drag-to-look + an on-screen
 * move joystick) are a bigger, separate build, not implemented here.
 */
export function SplatViewer({
  url,
  controls = "orbit",
  height = DEFAULT_VIEWER_HEIGHT,
  frame = DEFAULT_FRAME,
}: {
  url: string;
  controls?: "orbit" | "walk";
  height?: number | string;
  frame?: SplatFrame;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const isTouch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const walkMode = controls === "walk" && !isTouch;
  // A stable dependency: callers build `frame` inline on every render.
  const frameKey = JSON.stringify(frame);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let viewer: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pointerControls: any = null;
    let cleanupInput: (() => void) | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let walkCamera: any = null;
    let moveSpeed = MOVE_SPEED;
    const sceneFrame: SplatFrame = JSON.parse(frameKey);
    setLoading(true);
    setError(null);

    (async () => {
      const container = containerRef.current;
      if (!container) return;

      const [GaussianSplats3D, THREE] = await Promise.all([
        import("@mkkellogg/gaussian-splats-3d"),
        import("three"),
      ]);
      if (cancelled || !container) return;

      const viewerOpts: Record<string, unknown> = {
        rootElement: container,
        cameraUp: [0, 1, 0],
        initialCameraPosition: [2, 1.6, 2],
        initialCameraLookAt: [0, 1.6, 0],
        selfDrivenMode: true,
        sharedMemoryForWorkers: false,
      };

      if (walkMode) {
        const { PointerLockControls } = await import("three/addons/controls/PointerLockControls.js");
        const camera = new THREE.PerspectiveCamera(65, container.clientWidth / container.clientHeight, 0.05, 500);
        camera.position.set(2, 1.6, 2);
        walkCamera = camera;
        viewerOpts.camera = camera;
        viewerOpts.useBuiltInControls = false;

        pointerControls = new PointerLockControls(camera, container);
        pointerControls.addEventListener("lock", () => setLocked(true));
        pointerControls.addEventListener("unlock", () => setLocked(false));
        container.addEventListener("click", () => pointerControls.lock());

        const pressed = new Set<string>();
        const onKeyDown = (e: KeyboardEvent) => { if (KEY_TO_ACTION[e.code]) pressed.add(e.code); };
        const onKeyUp = (e: KeyboardEvent) => { pressed.delete(e.code); };
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);

        let lastFrame = performance.now();
        let frameId = 0;
        function movementLoop() {
          frameId = requestAnimationFrame(movementLoop);
          const now = performance.now();
          const dt = (now - lastFrame) / 1000;
          lastFrame = now;
          if (!pointerControls.isLocked) return;
          const step = moveSpeed * dt;
          for (const code of pressed) {
            switch (KEY_TO_ACTION[code]) {
              case "forward": pointerControls.moveForward(step); break;
              case "back": pointerControls.moveForward(-step); break;
              case "right": pointerControls.moveRight(step); break;
              case "left": pointerControls.moveRight(-step); break;
            }
          }
        }
        movementLoop();

        cleanupInput = () => {
          cancelAnimationFrame(frameId);
          window.removeEventListener("keydown", onKeyDown);
          window.removeEventListener("keyup", onKeyUp);
          pointerControls.dispose();
        };
      } else {
        viewerOpts.useBuiltInControls = true;
      }

      viewer = new GaussianSplats3D.Viewer(viewerOpts);

      // The library detects format by checking path.endsWith('.ply') etc
      // (confirmed by reading its real source, not assumed) - a presigned
      // R2/S3 URL's path is followed by a `?X-Amz-...` query string, so
      // that check never matches and it silently fails to load with
      // "File format not supported", reproduced live. Extracting just the
      // pathname (no query string) before checking the extension, and
      // passing the result explicitly, sidesteps the library's own
      // broken auto-detection entirely rather than depending on it.
      const pathname = (() => {
        try {
          return new URL(url).pathname;
        } catch {
          return url;
        }
      })();
      const format = pathname.endsWith(".ply")
        ? GaussianSplats3D.SceneFormat.Ply
        : pathname.endsWith(".ksplat")
          ? GaussianSplats3D.SceneFormat.KSplat
          : pathname.endsWith(".splat")
            ? GaussianSplats3D.SceneFormat.Splat
            : pathname.endsWith(".spz")
              ? GaussianSplats3D.SceneFormat.Spz
              : undefined;

      try {
        await viewer.addSplatScene(url, {
          format,
          showLoadingUI: true,
          splatAlphaRemovalThreshold: 5,
          rotation: sceneFrame.rotation,
          // Metric: raw units -> metres, and the ground plane lifted to y=0
          // (World Labs' convention, applied after the axis flip).
          ...(sceneFrame.metric
            ? {
                scale: Array(3).fill(sceneFrame.metric.scale),
                position: [0, sceneFrame.metric.groundOffset, 0],
              }
            : {}),
        });
        if (cancelled) {
          await viewer.dispose();
          return;
        }

        const bounds = measureScene(viewer.getSplatMesh(), THREE);
        if (bounds) {
          const [cx, cy, cz] = bounds.center;
          const [sx, sy, sz] = bounds.size;
          const span = Math.max(sx, sz, 1e-3);
          if (walkCamera && sceneFrame.metric) {
            // Real metres: stand where the first photo was taken, at eye
            // height, looking the way it looked.
            walkCamera.position.set(0, EYE_HEIGHT_M, 0);
            walkCamera.lookAt(0, EYE_HEIGHT_M, -1);
            walkCamera.near = 0.05;
            walkCamera.far = Math.max(200, span * 10);
            walkCamera.updateProjectionMatrix();
            moveSpeed = WALK_SPEED_M;
          } else if (walkCamera) {
            if (sceneFrame.originIsCapturePoint) {
              // Unknown scale, but the origin is the first photo's camera.
              walkCamera.position.set(0, 0, 0);
              walkCamera.lookAt(0, 0, -1);
            } else {
              // Stand in the middle of the space at roughly eye height,
              // facing along its longer horizontal side.
              walkCamera.position.set(cx, bounds.floorY + sy * 0.6, cz);
              walkCamera.lookAt(sx >= sz ? cx + 1 : cx, walkCamera.position.y, sx >= sz ? cz : cz + 1);
            }
            walkCamera.near = span * 0.002;
            walkCamera.far = span * 50;
            walkCamera.updateProjectionMatrix();
            // Crossing the whole space takes about four seconds.
            moveSpeed = span / 4;
          } else if (viewer.camera && viewer.controls) {
            viewer.camera.position.set(cx + span, cy + span * 0.5, cz + span);
            viewer.controls.target.set(cx, cy, cz);
            viewer.controls.update();
          }
        }
        viewer.start();
        setLoading(false);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this splat file.");
      }
    })();

    return () => {
      cancelled = true;
      if (cleanupInput) cleanupInput();
      if (viewer) viewer.dispose().catch(() => {});
    };
  }, [url, walkMode, height, frameKey]);

  return (
    // The wrapper carries the height too: with a percentage height (e.g.
    // "100%" on the experience page), an auto-height wrapper would make the
    // inner container resolve to zero and the canvas would never show.
    <div className="relative w-full" style={{ height }}>
      <div
        ref={containerRef}
        className="relative h-full w-full cursor-pointer overflow-hidden rounded-[var(--radius-md)] bg-black"
      >
        {loading && !error && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            Loading splat scene…
          </p>
        )}
        {walkMode && !loading && !error && !locked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-center text-sm text-white">
            <p>Click to look around<br />WASD or arrow keys to walk</p>
          </div>
        )}
      </div>
      {error && (
        <p className="absolute inset-x-0 bottom-0 bg-black/70 p-2 text-sm text-[var(--color-danger)]">{error}</p>
      )}
    </div>
  );
}
