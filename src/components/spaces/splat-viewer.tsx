"use client";

import { useEffect, useRef, useState } from "react";

// Real 3D Gaussian Splat rendering (free-tier plan step B2 —
// docs/free-tier-roadmap.md) via @mkkellogg/gaussian-splats-3d, a
// maintained open-source Three.js-based renderer — reusing an existing
// WebGL splat renderer rather than building one from scratch
// (docs/rd-blueprint-classification.md's own call on this). No hosted
// free training API exists for the splat itself (verified — see the
// roadmap doc), so this component only renders an already-trained file
// uploaded via the "Upload splat file" flow; producing that file is a
// manual step (docs/gaussian-splatting-guide.md).
//
// Loaded dynamically inside an effect, never imported at module scope:
// the library touches WebGL/Worker/WASM at Viewer-construction time, and
// this component's server-rendered pass (it's a client component, but
// Next still renders it once on the server for the initial HTML) must
// never evaluate that.
const VIEWER_HEIGHT = 480;

export function SplatViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let viewer: any = null;
    setLoading(true);
    setError(null);

    (async () => {
      const GaussianSplats3D = await import("@mkkellogg/gaussian-splats-3d");
      if (cancelled || !containerRef.current) return;

      viewer = new GaussianSplats3D.Viewer({
        rootElement: containerRef.current,
        cameraUp: [0, 1, 0],
        initialCameraPosition: [2, 2, 2],
        initialCameraLookAt: [0, 0, 0],
        selfDrivenMode: true,
        useBuiltInControls: true,
        sharedMemoryForWorkers: false,
      });

      try {
        await viewer.addSplatScene(url, { showLoadingUI: true, splatAlphaRemovalThreshold: 5 });
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
      if (viewer) viewer.dispose().catch(() => {});
    };
  }, [url]);

  return (
    <div>
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-[var(--radius-md)] bg-black"
        style={{ height: VIEWER_HEIGHT }}
      >
        {loading && !error && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            Loading splat scene…
          </p>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
