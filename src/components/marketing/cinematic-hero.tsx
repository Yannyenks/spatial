"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollScrubVideo } from "@/components/features/scroll-scrub-video";
import { GlassPanel, HudReadout } from "@/components/ui/glass-panel";
import { videoSources } from "@/lib/video-sources";
import { usePrefersReducedMotion } from "./motion-preferences";

const HERO_SOURCES = videoSources("perception-overlay");

/**
 * Scene 1 — "THE WORLD" (creative brief §04-§05; video master-prompt
 * §1/§5): the real captured-and-understood-space footage, scroll-scrubbed
 * rather than looping, is the opening thesis of the page. Headline and
 * CTAs are pinned alongside it (not a separate scroll-triggered fade —
 * §6: one motion moment per section, and the scrub already is it).
 */
export function CinematicHero() {
  const reduceMotion = usePrefersReducedMotion();
  const wordDelay = reduceMotion ? 0 : 0.08;

  const headlineWords = ["Turn", "real", "spaces", "into", "immersive", "worlds."];

  return (
    <ScrollScrubVideo
      sources={HERO_SOURCES}
      ariaLabel="A phone scanning a hotel room, the space resolving into a spatial reconstruction"
      heightVh={280}
      priority
      className="cinematic bg-[var(--bg)]"
      stages={[
        { at: 0, label: "Capturing" },
        { at: 0.45, label: "Understanding space" },
        { at: 0.85, label: "Reconstruction ready" },
      ]}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-transparent to-[var(--bg)]/50" />
      {/*
       * Measured (not eyeballed — see .contrast-check.js): the muted-grey
       * subheadline against the raw video frame scored 1.6-2.9:1 contrast
       * across the scrub range, well under the 4.5:1 WCAG AA floor for
       * body text. The old from/via/to-transparent horizontal gradient
       * faded out before reaching the text column, and the vertical one
       * is transparent in the middle band where the headline actually
       * sits. This one stays strongly opaque across the full width the
       * text column occupies (up to ~55%) regardless of scroll position,
       * independent of whatever the footage is doing underneath.
       */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[var(--bg)] from-10% via-[var(--bg)]/85 via-45% to-transparent to-75%" />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6">
        <div className="max-w-2xl">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-technical mb-6 text-[var(--fg-muted)]"
          >
            AI Spatial Experience Platform
          </motion.p>

          <h1 className="text-display text-[var(--fg)]">
            {headlineWords.map((word, i) => (
              <motion.span
                key={word}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 16, filter: reduceMotion ? "none" : "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.7, delay: i * wordDelay, ease: [0.16, 1, 0.3, 1] }}
                className="mr-[0.28em] inline-block"
              >
                {word}
              </motion.span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="text-body mt-6 max-w-md text-[var(--fg-muted)]"
          >
            Capture a place. Let AI understand it. Publish an experience your
            guests explore from anywhere.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="mt-10 flex flex-wrap items-center gap-3"
          >
            <Link href="/register">
              <Button size="lg" className="bg-[var(--color-accent)] text-[#08090b] hover:opacity-90">
                Create your first experience
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/experience/demo-hotel-riviera">
              <Button variant="secondary" size="lg">
                Explore a live demo
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>

      {/* bottom-8/right-8 in this same sticky viewport is already taken by
          ScrollScrubVideo's own stage-progress HUD — this one sits at the
          opposite corner so the two never overlap. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1.1 }}
        className="absolute bottom-10 left-6 z-10 hidden sm:block"
      >
        <GlassPanel>
          <p className="text-technical mb-2 text-[var(--color-accent)]">Live reconstruction</p>
          <div className="space-y-1">
            <HudReadout label="Space" value="Suite 204" />
            <HudReadout label="Coverage" value="94%" />
            <HudReadout label="Confidence" value="0.97" />
          </div>
        </GlassPanel>
      </motion.div>
    </ScrollScrubVideo>
  );
}
