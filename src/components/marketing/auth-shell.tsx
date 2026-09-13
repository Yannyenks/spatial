"use client";

import Link from "next/link";
import { CinematicVideo } from "@/components/features/cinematic-video";
import { GlassPanel } from "@/components/ui/glass-panel";
import { videoSources } from "@/lib/video-sources";

const SOURCES = videoSources("lobby-dolly");

/**
 * Shared shell for /login and /register (video master-prompt §1): a slow
 * dolly through a hotel lobby, ambient-looping behind the form. Reuses
 * `CinematicVideo` (lazy, reduced-motion-safe, multi-resolution) rather
 * than a bespoke background — the auth pages get the same guarantees as
 * every other video on the site for free.
 *
 * Wrapping in `.cinematic` flips every `--bg`/`--fg`/etc. token to the
 * dark palette for this subtree, so the existing form markup (Input,
 * Button, Label — all already token-driven) renders correctly here
 * without any changes of its own.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="cinematic relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg)] px-6 py-16">
      <CinematicVideo
        sources={SOURCES}
        ariaLabel="A slow dolly shot through a luxury hotel lobby"
        className="absolute inset-0 h-full w-full opacity-45"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[var(--bg)]/70 via-[var(--bg)]/60 to-[var(--bg)]" />

      <div className="relative z-10 flex w-full flex-col items-center">
        <Link href="/" className="text-technical mb-10 text-[var(--fg)]">
          Spatial
        </Link>
        <GlassPanel className="w-full max-w-sm p-8">{children}</GlassPanel>
      </div>
    </div>
  );
}
