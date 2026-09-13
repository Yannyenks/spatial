"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CinematicSection } from "./cinematic-section";
import { ImmersiveSection } from "@/components/features/immersive-section";
import { GlassPanel, HudReadout } from "@/components/ui/glass-panel";
import { videoSources } from "@/lib/video-sources";

const SOURCES = videoSources("one-twin-many-experiences");

/**
 * Creative brief §15 "Explore a space like you're there" / product spec
 * §40 "one capture, many experiences" — deep-links into the real,
 * working `/experience/demo-hotel-riviera` viewer rather than building a
 * second, fabricated preview of the product. The closing ambient-loop
 * scene (video master-prompt §1): one twin, radiating outward into every
 * experience it powers.
 */
export function ExploreCTA() {
  return (
    <ImmersiveSection
      sources={SOURCES}
      ariaLabel="A reconstructed space radiating outward into multiple experiences"
      scrimClassName="bg-[radial-gradient(50%_50%_at_50%_30%,rgba(169,126,63,0.12),transparent_70%)]"
    >
      <div className="mx-auto max-w-3xl px-6 text-center">
        <CinematicSection>
          <p className="text-technical text-[var(--color-accent)]">Explore a space like you&apos;re there</p>
          <h2 className="text-display mt-4 text-[var(--fg)]" style={{ fontSize: "clamp(2rem, 4.5vw, 3.25rem)" }}>
            This is a live experience, not a mockup.
          </h2>
          <p className="text-body mt-5 text-[var(--fg-muted)]">
            Walk through Hotel Riviera, ask the AI concierge a question, and
            see the same spatial graph shown above answer it in real time.
          </p>
          <Link href="/experience/demo-hotel-riviera" className="mt-8 inline-block">
            <Button size="lg" className="bg-[var(--color-accent)] text-[#08090b] hover:opacity-90">
              Enter the demo
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CinematicSection>

        <CinematicSection delay={0.2} className="mt-14 flex justify-center">
          <GlassPanel>
            <p className="text-technical mb-2 text-[var(--color-accent)]">Hotel Riviera</p>
            <div className="space-y-1">
              <HudReadout label="Spaces" value="5" />
              <HudReadout label="Status" value="Published" />
              <HudReadout label="Visibility" value="Public" />
            </div>
          </GlassPanel>
        </CinematicSection>
      </div>
    </ImmersiveSection>
  );
}
