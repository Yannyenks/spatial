"use client";

import { ScrollScrubVideo } from "@/components/features/scroll-scrub-video";
import { videoSources } from "@/lib/video-sources";

const SOURCES = videoSources("reconstruction-morph");

/**
 * Scene 2 — "Reality, reconstructed" (video master-prompt §1 page flow:
 * Hero scrub → reconstruction scrub → before/after → …). A real captured
 * interior resolving into its point-cloud reconstruction as the visitor
 * scrolls — the second and last scroll-scrubbed scene; every other video
 * on the page is an ambient loop (§2: scrub-friendly all-intra encoding
 * is expensive, reserved for the two moments where seeking precision
 * actually matters).
 */
export function ReconstructionScrub() {
  return (
    <ScrollScrubVideo
      sources={SOURCES}
      ariaLabel="A real room dissolving into its point-cloud spatial reconstruction"
      heightVh={260}
      className="bg-[var(--bg)]"
      stages={[
        { at: 0, label: "Observation" },
        { at: 0.4, label: "Point cloud" },
        { at: 0.8, label: "Structured twin" },
      ]}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-transparent to-[var(--bg)]/40" />
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="max-w-lg">
          <p className="text-technical text-[var(--color-accent)]">Reality, reconstructed</p>
          <h2 className="text-heading mt-3 text-[var(--fg)]">
            The same room, resolved into a structured spatial model.
          </h2>
          <p className="text-body mt-4 text-[var(--fg-muted)]">
            No manual 3D work. The reconstruction engine turns a walkthrough
            into geometry, objects and navigable space on its own.
          </p>
        </div>
      </div>
    </ScrollScrubVideo>
  );
}
