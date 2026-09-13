import { cn } from "@/lib/utils";
import { CinematicVideo } from "./cinematic-video";
import type { VideoSources } from "@/lib/video-sources";

/**
 * Full-screen video + content scene (video master-prompt §1) — the
 * pattern for sections that use an ambient looping video rather than a
 * scroll-scrub (semantic understanding, the closing "one twin, many
 * experiences" scene). The video is always `CinematicVideo` underneath,
 * so lazy-loading, the reduced-motion poster-only fallback, and
 * multi-resolution selection are inherited automatically rather than
 * re-implemented per section.
 */
export function ImmersiveSection({
  sources,
  ariaLabel,
  children,
  className,
  scrimClassName = "bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/50 to-[var(--bg)]/20",
}: {
  sources: VideoSources;
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
  scrimClassName?: string;
}) {
  return (
    <div className={cn("cinematic relative min-h-[90vh] overflow-hidden bg-[var(--bg)] py-28", className)}>
      <CinematicVideo sources={sources} ariaLabel={ariaLabel} className="absolute inset-0 h-full w-full opacity-60" />
      <div className={cn("pointer-events-none absolute inset-0", scrimClassName)} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
