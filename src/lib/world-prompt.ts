// The text guidance sent to World Labs alongside a space's photos, built
// from what Spatial already knows about that space: what kind of room it
// is, which property it belongs to, and what the capture actually showed.
// Without it Marble captions the photos itself and can drift from the real
// place (a hotel suite reimagined as a living room).

import type { ProjectType, SpaceKind } from "@/types";

const SPACE_KIND_LABEL: Record<SpaceKind, string> = {
  LOBBY: "lobby",
  CORRIDOR: "corridor",
  ROOM: "room",
  SUITE: "suite",
  BATHROOM: "bathroom",
  RESTAURANT: "restaurant dining room",
  POOL: "swimming pool area",
  GYM: "gym",
  OFFICE: "office",
  OUTDOOR: "outdoor area",
  OTHER: "interior space",
};

const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  HOTEL: "hotel",
  VILLA: "villa",
  APARTMENT: "apartment",
  REAL_ESTATE: "property",
  RESTAURANT: "restaurant",
  OFFICE: "office building",
  HEALTHCARE: "healthcare facility",
  RETAIL: "store",
  OTHER: "property",
};

/** Longest user instruction accepted for a restyled world. */
export const MAX_WORLD_INSTRUCTION_LENGTH = 500;
const MAX_LISTED_FEATURES = 12;

export interface WorldPromptContext {
  project: { name: string; type: string };
  space: { name: string; kind: string };
  /** Detected objects; only those the capture really showed are described. */
  objects?: { type: string; label: string | null; provenance: string }[];
  /** Free-text features from the spatial graph (`Room 204 --has--> "balcony"`). */
  concepts?: string[];
  /** A requested change (new decor, lighting...) for a restyled version. */
  instruction?: string | null;
}

export function buildWorldPrompt(ctx: WorldPromptContext): string {
  const kind = SPACE_KIND_LABEL[ctx.space.kind as SpaceKind] ?? SPACE_KIND_LABEL.OTHER;
  const property = PROJECT_TYPE_LABEL[ctx.project.type as ProjectType] ?? PROJECT_TYPE_LABEL.OTHER;
  const sentences = [`The ${kind} "${ctx.space.name}" of the ${property} "${ctx.project.name}".`];

  // §46 technological separation: INFERRED/GENERATED objects were never
  // seen on site, so they must not be presented to the model as fact.
  const seen = (ctx.objects ?? [])
    .filter((o) => o.provenance === "REAL" || o.provenance === "COMPUTED")
    .map((o) => (o.label ?? o.type).trim().toLowerCase());
  const features = unique([...seen, ...(ctx.concepts ?? []).map((c) => c.trim().toLowerCase())]).filter(Boolean);
  if (features.length > 0) {
    sentences.push(`It contains: ${features.slice(0, MAX_LISTED_FEATURES).join(", ")}.`);
  }

  const instruction = ctx.instruction?.trim().slice(0, MAX_WORLD_INSTRUCTION_LENGTH);
  if (instruction) {
    sentences.push(`Keep the room's layout, walls, windows and doors as photographed, but apply this change: ${instruction}`);
  } else {
    sentences.push("Reproduce the space faithfully as photographed, without adding or removing elements.");
  }
  return sentences.join(" ");
}

/** World Labs tags (max 10, 32 chars each) so a world can be traced back to its space. */
export function worldTags(ctx: { projectId: string; spaceId: string; spaceKind: string; restyled: boolean }): string[] {
  // cuids are 25 chars, so the prefixes stay short enough to keep them whole.
  return ["spatial", `s-${ctx.spaceId}`, `p-${ctx.projectId}`, ctx.spaceKind.toLowerCase(), ...(ctx.restyled ? ["restyled"] : [])].map(
    (tag) => tag.slice(0, 32)
  );
}

function unique(values: string[]) {
  return [...new Set(values)];
}
