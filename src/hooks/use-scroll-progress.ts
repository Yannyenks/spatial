"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Tracks how far a tall wrapper element has scrolled through the
 * viewport, as 0→1, and reports it via callback rather than React state
 * (video master-prompt §4.5: "the rAF must never cost more than ~2ms; if
 * profiling shows more, replace setState with a direct DOM write").
 *
 * Expected DOM shape — a tall wrapper with a `position: sticky` child
 * pinned inside it (the pattern `ScrollScrubVideo` uses):
 *
 * ```
 * <div ref={wrapperRef} style={{ height: "300vh" }}>   <- scroll distance
 *   <div style={{ position: "sticky", top: 0, height: "100vh" }}>
 *     <video ... />                                     <- stays pinned
 *   </div>
 * </div>
 * ```
 *
 * progress = 0 when the wrapper's top just reaches the viewport top;
 * progress = 1 when the wrapper's bottom reaches the viewport bottom —
 * i.e. exactly the span during which the sticky child is pinned.
 *
 * The callback is invoked at most once per animation frame (a `scroll`
 * listener sets a flag; the actual measurement happens in the next rAF),
 * and only when the wrapper is anywhere near the viewport — once it's
 * fully scrolled past in either direction, measurement stops until it's
 * close again, so idle scrolling elsewhere on the page costs nothing.
 */
export function useScrollProgress(containerRef: RefObject<HTMLElement | null>, onProgress: (progress: number) => void) {
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useEffect(() => {
    let ticking = false;
    let rafId = 0;

    function measure() {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const scrollableDistance = rect.height - viewportH;

      if (scrollableDistance <= 0) {
        onProgressRef.current(0);
        return;
      }

      const raw = -rect.top / scrollableDistance;
      const clamped = Math.min(1, Math.max(0, raw));
      onProgressRef.current(clamped);
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      rafId = requestAnimationFrame(() => {
        measure();
        ticking = false;
      });
    }

    measure(); // initial position (e.g. a mid-page reload/deep link)
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [containerRef]);
}
