"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useScrollProgress } from "@/hooks/use-scroll-progress";
import { pickVideoSource, type VideoSources } from "@/lib/video-sources";
import { usePrefersReducedMotion } from "@/components/marketing/motion-preferences";
import { GlassPanel } from "@/components/ui/glass-panel";

export interface ScrollStage {
  /** Progress threshold, 0-1, at which this label becomes current. */
  at: number;
  label: string;
}

const MOBILE_BREAKPOINT = 768;
const SMOOTHING = 0.15; // video master-prompt §5: exponential smoothing factor
const END_SNAP_THRESHOLD = 0.98;

/**
 * Scroll-pinned, scroll-scrubbed video (video master-prompt §1, §5).
 * `video.currentTime` tracks scroll progress through a tall wrapper via
 * `useScrollProgress`, smoothed with exponential easing so a fast/jerky
 * scroll never makes the video visibly jump — and written straight to
 * the DOM (`videoRef.current.currentTime`), never through React state,
 * so a scroll frame never triggers a re-render (§4.5).
 *
 * Falls back to an ordinary ambient loop (§7) — never a pinned/tall
 * layout — on narrow viewports and under `prefers-reduced-motion`; in
 * the latter case there is no `<video>` element at all, only the poster.
 */
export function ScrollScrubVideo({
  sources,
  ariaLabel,
  heightVh = 300,
  stages,
  priority = false,
  className,
  children,
}: {
  sources: VideoSources;
  ariaLabel: string;
  /** Height of the scrollable wrapper, in vh — controls how much scroll distance the scrub spans. */
  heightVh?: number;
  stages?: ScrollStage[];
  /** Only the Hero should be true — eager `preload="auto"`, no IntersectionObserver gate. */
  priority?: boolean;
  className?: string;
  /**
   * Content pinned alongside the video inside the same sticky viewport —
   * per the master-prompt's own §6 rule, this content should stay static
   * while pinned rather than layering a second scroll-triggered motion
   * effect on top of the video's own.
   */
  children?: React.ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const targetProgress = useRef(0);
  const smoothedProgress = useRef(0);
  const rafRef = useRef(0);

  const [isMobile, setIsMobile] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(priority);
  const [src, setSrc] = useState<string | null>(null);
  const [currentStageLabel, setCurrentStageLabel] = useState(stages?.[0]?.label ?? "");
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check, { passive: true });
    return () => window.removeEventListener("resize", check);
  }, []);

  const useFallback = isMobile || reduceMotion;

  // Lazy-load gate for non-priority instances (the reconstruction scene,
  // not the Hero) — mirrors CinematicVideo's IntersectionObserver.
  useEffect(() => {
    if (priority || useFallback) return;
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [priority, useFallback]);

  useEffect(() => {
    if (shouldLoad) setSrc(pickVideoSource(sources));
  }, [shouldLoad, sources]);

  // Scroll → target progress (cheap: just stores a number, no DOM writes here).
  useScrollProgress(wrapperRef, (p) => {
    targetProgress.current = p;
  });

  // Independent rAF loop: continuously eases `smoothedProgress` toward
  // `targetProgress` and writes it straight to the video element. Runs
  // every frame regardless of whether a scroll event just fired, which
  // is what makes the motion read as smooth even when scroll input itself
  // is jerky (a mouse wheel or fast trackpad flick).
  useEffect(() => {
    if (useFallback || !shouldLoad) return;

    function tick() {
      const video = videoRef.current;
      const target = targetProgress.current;

      if (target >= END_SNAP_THRESHOLD) {
        // Snap rather than ease into the very end — avoids settling on a
        // possibly-black/incomplete final frame depending on encoding.
        smoothedProgress.current = 1;
      } else {
        smoothedProgress.current += (target - smoothedProgress.current) * SMOOTHING;
      }

      if (video && video.duration) {
        const t =
          smoothedProgress.current >= 1
            ? Math.max(0, video.duration - 0.05)
            : smoothedProgress.current * video.duration;
        video.currentTime = t;
      }

      if (stages && stages.length > 0) {
        let label = stages[0]!.label;
        for (const stage of stages) {
          if (smoothedProgress.current >= stage.at) label = stage.label;
        }
        setCurrentStageLabel((prev) => (prev === label ? prev : label));
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useFallback, shouldLoad]);

  if (useFallback) {
    // The children wrapper is `absolute inset-0`, not an in-flow `relative`
    // box: children (e.g. CinematicHero's absolutely-positioned corner HUD
    // panel) use `absolute bottom-*`, which resolves against the nearest
    // positioned ancestor's height. An in-flow wrapper's height shrinks to
    // fit its own in-flow content (the headline block — absolutely
    // positioned siblings like the HUD panel don't count), so "bottom"
    // landed just below that content instead of the container's true
    // bottom edge, overlapping the centered text. `inset-0` pins it to
    // the outer min-h-[70vh] box exactly, giving a stable height instead.
    return (
      <div className={cn("relative flex min-h-screen items-center overflow-hidden", className)}>
        <FallbackLoop sources={sources} ariaLabel={ariaLabel} reduceMotion={reduceMotion} />
        {children && <div className="absolute inset-0 z-10 flex items-center">{children}</div>}
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)} style={{ height: `${heightVh}vh` }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <picture>
          <source srcSet={sources.poster.webp} type="image/webp" />
          <img
            src={sources.poster.jpg}
            alt=""
            aria-hidden
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
              src ? "opacity-0" : "opacity-100"
            )}
          />
        </picture>

        {src && (
          <video
            ref={videoRef}
            key={src}
            className="absolute inset-0 h-full w-full object-cover"
            aria-label={ariaLabel}
            muted
            playsInline
            // Always "auto", not just for `priority`: this is a scrub video —
            // currentTime gets rewritten on every rAF tick once scrolled into
            // view. "metadata" only fetches on-demand byte ranges as currentTime
            // moves, and a rapid-fire scrub cancels each in-flight range fetch
            // before it resolves, so readyState never climbs past HAVE_METADATA
            // and the frame visibly freezes/stutters instead of tracking scroll.
            // `priority` only controls *when* loading starts (immediately vs.
            // gated by the IntersectionObserver below) — once it starts, a
            // scrub video always needs the whole file buffered ahead of time.
            preload="auto"
          >
            <source src={src} type="video/mp4" />
          </video>
        )}

        {children && <div className="relative z-10 flex h-full w-full items-center">{children}</div>}

        {stages && stages.length > 0 && (
          <div className="pointer-events-none absolute bottom-8 right-8 z-10 hidden sm:block">
            <GlassPanel className="flex items-center gap-3 px-3 py-2">
              {/* Discrete 1px progress indicator — deliberately not a generic upload-style bar (§5). */}
              <div className="relative h-10 w-px bg-[var(--line)]">
                <ScrubTick smoothedProgressRef={smoothedProgress} />
              </div>
              <span className="text-technical text-[var(--fg-muted)]">{currentStageLabel}</span>
            </GlassPanel>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The 1px vertical fill ticks via a direct style write on its own ref, on
 * the same rAF cadence as the video scrub — same reasoning as the video's
 * `currentTime` write: a DOM mutation, not a per-frame React re-render.
 */
function ScrubTick({ smoothedProgressRef }: { smoothedProgressRef: React.RefObject<number> }) {
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    function tick() {
      if (fillRef.current) {
        fillRef.current.style.height = `${Math.round(smoothedProgressRef.current * 100)}%`;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [smoothedProgressRef]);

  return <div ref={fillRef} className="absolute bottom-0 left-0 w-full bg-[var(--color-accent)]" style={{ height: "0%" }} />;
}

function FallbackLoop({
  sources,
  ariaLabel,
  reduceMotion,
}: {
  sources: VideoSources;
  ariaLabel: string;
  reduceMotion: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!reduceMotion) setSrc(sources.sd); // mobile fallback always uses the light tier, never -1080/-2160 (§7)
  }, [sources, reduceMotion]);

  return (
    <>
      <picture>
        <source srcSet={sources.poster.webp} type="image/webp" />
        <img
          src={sources.poster.jpg}
          alt=""
          aria-hidden
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-700",
            src ? "opacity-0" : "opacity-100"
          )}
        />
      </picture>
      {src && (
        <video
          key={src}
          className="absolute inset-0 h-full w-full object-cover"
          aria-label={ariaLabel}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
        >
          <source src={src} type="video/mp4" />
        </video>
      )}
    </>
  );
}
