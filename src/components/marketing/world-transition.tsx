"use client";

import { useState } from "react";
import { CinematicSection } from "./cinematic-section";

/**
 * A single stylized room outline, rendered twice with different
 * treatments (solid "photograph" vs. dotted "reconstruction"). This is
 * illustrative geometry, not a real property photo — the point is to
 * make the *transformation concept* legible without claiming a specific
 * capture this build didn't actually run (creative brief §07, product
 * rule "never simulate AI").
 */
function RoomIllustration({ variant }: { variant: "before" | "after" }) {
  const stroke = variant === "before" ? "#a97e3f" : "#8b8d94";
  const strokeWidth = variant === "before" ? 2 : 1.2;
  const dash = variant === "after" ? "2 6" : undefined;

  return (
    <svg viewBox="0 0 400 260" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <rect x="0" y="0" width="400" height="260" fill={variant === "before" ? "#12100c" : "#08090b"} />
      {/* Room shell */}
      <rect x="30" y="30" width="340" height="200" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />
      {/* Window */}
      <rect x="270" y="60" width="70" height="90" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />
      <line x1="305" y1="60" x2="305" y2="150" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />
      {/* Bed */}
      <rect x="55" y="140" width="120" height="70" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />
      <rect x="55" y="140" width="120" height="18" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />
      {/* Table */}
      <circle cx="230" cy="180" r="22" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />
      {variant === "after" &&
        Array.from({ length: 90 }).map((_, i) => (
          <circle
            key={i}
            cx={40 + ((i * 37) % 330)}
            cy={40 + ((i * 53) % 180)}
            r={0.9}
            fill="#f4f3ef"
            opacity={0.5}
          />
        ))}
    </svg>
  );
}

/**
 * Before/after comparison, driven by a native `<input type="range">`
 * (keyboard-operable, screen-reader labeled) rather than a pointer-only
 * custom widget (docs/design-system.md accessibility rules).
 */
export function WorldTransition() {
  const [value, setValue] = useState(50);

  return (
    <div className="cinematic bg-[var(--bg-muted)] py-28">
      <div className="mx-auto max-w-4xl px-6">
        <CinematicSection>
          <p className="text-technical text-[var(--color-accent)]">Capture → reconstruction</p>
          <h2 className="text-heading mt-3 text-[var(--fg)]">The same room, understood differently.</h2>
          <p className="text-body mt-3 max-w-lg text-[var(--fg-muted)]">
            Drag to compare a walkthrough capture with the spatial structure AI
            recovers from it. Illustrative — not a specific real capture.
          </p>
        </CinematicSection>

        <CinematicSection delay={0.15} className="mt-10">
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)]">
            <div className="absolute inset-0">
              <RoomIllustration variant="before" />
            </div>
            <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${value}%)` }}>
              <RoomIllustration variant="after" />
            </div>
            <div
              className="absolute inset-y-0 w-px bg-[var(--color-accent)]"
              style={{ left: `${value}%` }}
              aria-hidden
            />
          </div>
          <label className="mt-4 block">
            <span className="sr-only">Compare capture and reconstruction</span>
            <input
              type="range"
              min={0}
              max={100}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              className="focus-ring w-full accent-[var(--color-accent)]"
            />
          </label>
          <div className="mt-1 flex justify-between text-technical text-[var(--fg-muted)]">
            <span>Capture</span>
            <span>Reconstruction</span>
          </div>
        </CinematicSection>
      </div>
    </div>
  );
}
