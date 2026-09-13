"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { pickVideoSource, type VideoSources } from "@/lib/video-sources";
import { usePrefersReducedMotion } from "@/components/marketing/motion-preferences";

/**
 * Ambient looping background video (video master-prompt §1, §4, §8).
 *
 * - Lazy: does not start loading until the element is near the viewport
 *   (`IntersectionObserver`, generous `rootMargin` so it's ready by the
 *   time it's actually visible, but never fetches while far off-screen).
 * - `prefers-reduced-motion: reduce` → never mounts a `<video>` at all,
 *   shows the static poster only (§8: not "autoplay disabled", literally
 *   no video element).
 * - Multi-resolution: picks a tier once on mount via `pickVideoSource`
 *   (§3) rather than shipping every `<source>` tag (avoids the browser
 *   speculatively range-requesting multiple files).
 */
export function CinematicVideo({
  sources,
  ariaLabel,
  className,
  overlayClassName,
}: {
  sources: VideoSources;
  ariaLabel: string;
  className?: string;
  overlayClassName?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || reduceMotion) return;
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
  }, [reduceMotion]);

  useEffect(() => {
    if (shouldLoad) setSrc(pickVideoSource(sources));
  }, [shouldLoad, sources]);

  return (
    <div ref={wrapperRef} className={cn("relative overflow-hidden", className)} aria-hidden={false}>
      <picture>
        <source srcSet={sources.poster.webp} type="image/webp" />
        <img
          src={sources.poster.jpg}
          alt=""
          aria-hidden
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-cinematic",
            shouldLoad && !reduceMotion ? "opacity-0" : "opacity-100"
          )}
        />
      </picture>

      {!reduceMotion && src && (
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

      {overlayClassName && <div className={cn("pointer-events-none absolute inset-0", overlayClassName)} />}
    </div>
  );
}
