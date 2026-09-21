"use client";

import Link from "next/link";
import { GlassPanel } from "@/components/ui/glass-panel";
import { videoSources } from "@/lib/video-sources";

const SOURCES = videoSources("lobby-dolly");

/**
 * Shared shell for /login and /register: a still frame from the same
 * hotel-lobby dolly shot used elsewhere on the site (video master-prompt
 * §1), NOT the looping `CinematicVideo` those other pages use.
 *
 * These two pages gate 100% of the product — nobody can do anything here
 * without registering or logging in first — so nothing on them may be
 * allowed to compete for bandwidth with the actual form submission.
 * Reproduced live: on a sufficiently constrained connection, the ambient
 * background video (even lazy-loaded, even after `fetchPriority="low"`
 * was tried here first) can occupy the browser's connection budget for
 * the ~1-2 minutes a 480p-1080p file takes to download, and the register
 * POST simply never gets a response in that window — an indefinite,
 * silent hang with no error shown, not a slow-but-working page. A static
 * poster image carries none of that risk regardless of connection quality
 * or browser (unlike the adaptive bitrate logic in `video-sources.ts`,
 * which depends on the Network Information API and is a heuristic, not a
 * guarantee — and is entirely absent in Safari/Firefox). The rest of the
 * site keeps the real ambient video; only these two pages trade it for a
 * still frame.
 *
 * Wrapping in `.cinematic` flips every `--bg`/`--fg`/etc. token to the
 * dark palette for this subtree, so the existing form markup (Input,
 * Button, Label — all already token-driven) renders correctly here
 * without any changes of its own.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="cinematic relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg)] px-6 py-16">
      <picture className="absolute inset-0 h-full w-full opacity-45">
        <source srcSet={SOURCES.poster.webp} type="image/webp" />
        <img
          src={SOURCES.poster.jpg}
          alt=""
          aria-hidden
          fetchPriority="low"
          className="h-full w-full object-cover"
        />
      </picture>
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
