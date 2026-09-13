import { cn } from "@/lib/utils";

/**
 * Floating glass/HUD container (video master-prompt §1, §5, §13 of the
 * earlier creative brief) — a translucent, hairline-bordered panel that
 * reads as an instrument readout, not a SaaS tooltip: no drop shadow, no
 * consumer-app rounding, `--radius-md` only. Compose with `HudReadout`
 * rows inside; nothing about `GlassPanel` itself assumes a title/rows
 * shape, so it also works as a bare wrapper (e.g. around a scroll-scrub
 * progress indicator).
 */
export function GlassPanel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "cinematic rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--bg-muted)]/70 px-4 py-3 backdrop-blur-md",
        className
      )}
      {...props}
    />
  );
}

/** One label/value technical readout row, meant to live inside a `GlassPanel`. */
export function HudReadout({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)}>
      <dt className="text-technical text-[var(--fg-muted)]">{label}</dt>
      <dd className="text-technical text-[var(--fg)]">{value}</dd>
    </div>
  );
}
