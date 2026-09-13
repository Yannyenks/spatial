import Link from "next/link";
import type { Metadata } from "next";
import { CinematicHero } from "@/components/marketing/cinematic-hero";
import { ReconstructionScrub } from "@/components/marketing/reconstruction-scrub";
import { ProcessSteps } from "@/components/marketing/process-steps";
import { WorldTransition } from "@/components/marketing/world-transition";
import { SpatialGraphReveal } from "@/components/marketing/spatial-graph-reveal";
import { ExploreCTA } from "@/components/marketing/explore-cta";

// Dedicated OG image cropped to 1200x630 from an actual Hero frame (video
// master-prompt §9) — never the raw 1920x1080 poster, and never a video
// (OG previews render static images only).
export const metadata: Metadata = {
  openGraph: { images: [{ url: "/og/landing.jpg", width: 1200, height: 630 }] },
  twitter: { images: ["/og/landing.jpg"] },
};

export default function LandingPage() {
  return (
    <main className="cinematic bg-[var(--bg)] text-[var(--fg)]">
      <header className="absolute inset-x-0 top-0 z-20 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="text-technical text-[var(--fg)]">Spatial</div>
        <nav className="flex items-center gap-3">
          <Link href="/login" className="text-technical text-[var(--fg-muted)] hover:text-[var(--fg)]">
            Sign in
          </Link>
        </nav>
      </header>

      {/* Page flow per the video master-prompt: Hero scrub → reconstruction
          scrub → before/after → semantic understanding → steps → one
          capture, many experiences. */}
      <CinematicHero />
      <ReconstructionScrub />
      <WorldTransition />
      <SpatialGraphReveal />
      <ProcessSteps />
      <ExploreCTA />

      <footer className="cinematic border-t border-[var(--line)] bg-[var(--bg)] px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 text-technical text-[var(--fg-muted)] sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} Spatial</span>
          <span>AI Spatial Experience Platform</span>
        </div>
      </footer>
    </main>
  );
}
