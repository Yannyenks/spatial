/**
 * Multi-resolution video source selection (video master-prompt §3).
 * Never ship a single 4K file to every device — pick a tier based on
 * viewport width and, where the browser exposes it, connection quality.
 */
export interface VideoSources {
  /** ~480p — mobile fallback / slow connection. */
  sd: string;
  /** ~1080p — desktop standard. */
  hd: string;
  /** ~2160p — large desktop / retina. Optional: only generated when a source is genuinely 4K, never an upscale. */
  uhd?: string;
  poster: { jpg: string; webp: string };
}

/** Builds the standard {name}-480.mp4 / {name}-1080.mp4 / posters/{name}.{jpg,webp} set. */
export function videoSources(name: string, opts?: { uhd?: boolean }): VideoSources {
  return {
    sd: `/videos/${name}-480.mp4`,
    hd: `/videos/${name}-1080.mp4`,
    uhd: opts?.uhd ? `/videos/${name}-2160.mp4` : undefined,
    poster: { jpg: `/posters/${name}.jpg`, webp: `/posters/${name}.webp` },
  };
}

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
}

/**
 * Picks the best-fit tier for the current device. Client-only (reads
 * `window`) — call from an effect/event handler, not during render.
 */
export function pickVideoSource(sources: VideoSources): string {
  if (typeof window === "undefined") return sources.hd;

  const nav = navigator as Navigator & { connection?: NetworkInformationLike };
  const connection = nav.connection;
  const isSlowConnection =
    connection?.saveData === true ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g" ||
    connection?.effectiveType === "3g";

  const width = window.innerWidth;

  if (isSlowConnection || width < 640) return sources.sd;
  // Never load the 2160 tier below 1600px, even on a high-DPR screen —
  // it's wasted bytes below that viewport size (§3).
  if (sources.uhd && width >= 1600 && window.devicePixelRatio > 1) return sources.uhd;
  return sources.hd;
}
