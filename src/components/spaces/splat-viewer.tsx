"use client";

import { useEffect, useRef, useState } from "react";

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
const MOVE_SPEED = 3; // meters/second, roughly a slow walking pace
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
}: {
  url: string;
  controls?: "orbit" | "walk";
  height?: number | string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const isTouch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const walkMode = controls === "walk" && !isTouch;

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let viewer: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pointerControls: any = null;
    let cleanupInput: (() => void) | null = null;
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
          const step = MOVE_SPEED * dt;
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
            : undefined;

      try {
        await viewer.addSplatScene(url, { format, showLoadingUI: true, splatAlphaRemovalThreshold: 5 });
        if (cancelled) {
          await viewer.dispose();
          return;
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
  }, [url, walkMode, height]);

  return (
    <div>
      <div
        ref={containerRef}
        className="relative w-full cursor-pointer overflow-hidden rounded-[var(--radius-md)] bg-black"
        style={{ height }}
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
      {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
