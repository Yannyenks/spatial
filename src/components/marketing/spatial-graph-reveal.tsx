"use client";

import { CinematicSection } from "./cinematic-section";
import { ImmersiveSection } from "@/components/features/immersive-section";
import { videoSources } from "@/lib/video-sources";

const SOURCES = videoSources("semantic-graph");

interface TreeNode {
  label: string;
  children?: TreeNode[];
}

const TREE: TreeNode = {
  label: "Hotel Riviera",
  children: [
    { label: "Suite 204", children: [{ label: "balcony" }, { label: "ocean view" }] },
    { label: "Corridor" },
    { label: "Pool Deck", children: [{ label: "infinity pool" }] },
    { label: "Restaurant" },
  ],
};

function Branch({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  return (
    <div>
      <div className="flex items-center gap-2" style={{ paddingLeft: depth * 20 }}>
        {depth > 0 && <span className="text-[var(--fg-muted)]">└</span>}
        <span className={depth === 0 ? "text-heading text-[var(--fg)]" : "text-body text-[var(--fg)]"} style={depth > 0 ? { fontSize: "0.9375rem" } : undefined}>
          {node.label}
        </span>
      </div>
      {node.children?.map((child) => <Branch key={child.label} node={child} depth={depth + 1} />)}
    </div>
  );
}

/** Creative brief §16 "AI understands space" — this is real seeded data, not a mockup graphic. */
export function SpatialGraphReveal() {
  return (
    <ImmersiveSection
      sources={SOURCES}
      ariaLabel="A glowing node branching into a tree, representing a spatial knowledge graph"
    >
      <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-2">
        <CinematicSection>
          <p className="text-technical text-[var(--color-accent)]">Semantic world model</p>
          <h2 className="text-heading mt-3 max-w-md text-[var(--fg)]">
            AI doesn&apos;t just see the space. It understands it.
          </h2>
          <p className="text-body mt-4 max-w-md text-[var(--fg-muted)]">
            Every space, room and fact is stored as a real spatial graph — not
            a caption on a photo. It&apos;s what lets an AI concierge answer
            &quot;which rooms have a balcony&quot; correctly, every time.
          </p>
        </CinematicSection>

        <CinematicSection
          delay={0.15}
          className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--bg-muted)]/90 p-8 backdrop-blur-sm"
        >
          <Branch node={TREE} />
        </CinematicSection>
      </div>
    </ImmersiveSection>
  );
}
