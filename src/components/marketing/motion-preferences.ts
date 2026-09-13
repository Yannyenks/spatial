"use client";

import { useEffect, useState } from "react";

/**
 * Single source of truth for `prefers-reduced-motion` across the
 * cinematic marketing components (docs/design-system.md "Motion
 * principles"). When true: disable camera auto-rotation (render one
 * static frame), scroll-linked parallax (fade only, no translate), and
 * before/after auto-play (user must drag).
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return reduced;
}

/** Heuristic for capping 3D scene complexity on weaker devices (design-system.md "Responsive rules"). */
export function useSceneQuality(): "full" | "reduced" {
  const [quality, setQuality] = useState<"full" | "reduced">("full");

  useEffect(() => {
    const narrow = window.innerWidth < 480;
    const lowCores = typeof navigator !== "undefined" && (navigator.hardwareConcurrency ?? 8) <= 4;
    setQuality(narrow || lowCores ? "reduced" : "full");
  }, []);

  return quality;
}
