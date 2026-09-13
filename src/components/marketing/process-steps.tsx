"use client";

import { CinematicSection } from "./cinematic-section";

const STEPS = [
  { n: "01", title: "Capture", body: "Walk through the space with a phone. No 3D expertise, no special hardware." },
  { n: "02", title: "Understand", body: "AI analyzes coverage, camera motion and structure as it comes in." },
  { n: "03", title: "Reconstruct", body: "Rooms, connections and objects are organized into a navigable digital twin." },
  { n: "04", title: "Experience", body: "One public link, ready for guests to explore on any device." },
];

/** Creative brief §17 "From Reality to Digital Twin", four-scene sequence. */
export function ProcessSteps() {
  return (
    <div className="cinematic bg-[var(--bg)] py-28">
      <div className="mx-auto max-w-6xl px-6">
        <CinematicSection>
          <p className="text-technical text-[var(--color-accent)]">From reality to digital twin</p>
          <h2 className="text-heading mt-3 max-w-lg text-[var(--fg)]">
            Four steps turn a walkthrough into a world.
          </h2>
        </CinematicSection>

        <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <CinematicSection key={step.n} delay={i * 0.1}>
              <p className="text-technical text-[var(--fg-muted)]">{step.n}</p>
              <h3 className="text-heading mt-3 text-[var(--fg)]" style={{ fontSize: "1.25rem" }}>
                {step.title}
              </h3>
              <p className="text-body mt-2 text-[var(--fg-muted)]" style={{ fontSize: "0.9375rem" }}>
                {step.body}
              </p>
            </CinematicSection>
          ))}
        </div>
      </div>
    </div>
  );
}
