# Reconstruction engine

## Interface

```ts
interface ReconstructionEngine {
  readonly id: string;
  analyze(input: ReconstructionInput): Promise<AnalysisResult>;
  reconstruct(input: ReconstructionInput): Promise<ReconstructionResult>;
  optimize(input: OptimizationInput): Promise<OptimizationResult>;
}
```

(`src/providers/reconstruction/types.ts`) — matches product spec §12
exactly. No file outside `src/providers/reconstruction/` and
`src/jobs/pipeline.ts` (which calls it) knows which technology is behind
this interface.

## Today: `MockReconstructionEngine`

Does not run photogrammetry, NeRF, or Gaussian Splatting. What it *does*
do, honestly:

- Validates that assets exist and warns (via `AnalysisResult.warnings`)
  when there are fewer than 8, which is a real, useful signal even
  without real CV.
- Synthesizes a placeholder camera ring (`AnalysisResult.cameraPositions`)
  purely to drive the navigation UI — this is explicitly documented in
  the class as *not* measured geometry.
- Persists a real `scene.json` to the `reconstruction` storage bucket via
  the configured `StorageProvider`, so `Reconstruction.outputUri` always
  points at something that actually exists on disk/S3.
- Returns `method: "MOCK"` on every result, so the versioning UI
  (`/projects/:id/reconstruction`) always shows the true provenance of
  each version rather than implying real reconstruction happened.

## Adding a real engine

1. Create `src/providers/reconstruction/<name>-engine.ts` implementing
   `ReconstructionEngine`.
2. Register it in `src/providers/reconstruction/index.ts` under a new
   `RECONSTRUCTION_PROVIDER` value.
3. Set `RECONSTRUCTION_PROVIDER=<name>` in `.env`.

Nothing in `src/jobs/pipeline.ts`, the API routes, or the UI needs to
change — they only depend on the `ReconstructionEngine` interface and the
domain types (`Scene`, `SpatialObject`, `QualityScore`, …) in
`src/types/index.ts`.

## Versioning (§21)

Every successful pipeline run creates a **new** `Reconstruction` row
(`version` incremented, `isCurrent: true`) rather than overwriting the
previous one; the previous row's `isCurrent` is flipped to `false` but it
is never deleted. `src/services/reconstruction.service.ts` exposes
`listReconstructionsByProject` (full history per space) and
`restoreReconstructionVersion` (flip `isCurrent` back to an older
version) — surfaced in `/projects/:id/reconstruction`.

## Semantic World Model (platform spec §12; R&D blueprint §17/§20)

Two additions turn the flat list of spaces into an actual knowledge graph:

- **Containment hierarchy** — `Space.parentSpaceId` (self-relation). A
  Room can sit under a Floor, which can sit under a Building, independent
  of how visitors *navigate* between spaces (see below). Seeded example:
  `Hotel Riviera > Floor 2 > Suite 204`.
- **`SpatialRelation`** — a generic subject-predicate-object edge
  (`src/services/spatial-graph.service.ts`), e.g. `Suite 204 --has-->
  "balcony"` or `Suite 204 --overlooks--> Pool Deck`. The object side can
  point at another Space, another object, or a free-text `CONCEPT` (for
  facts not yet backed by a detected object, like "balcony" before any
  real object-detection model exists). Every relation carries a
  `provenance` (`REAL | COMPUTED | INFERRED | GENERATED`) so the UI never
  presents an owner-asserted fact with the same weight as an AI guess
  (blueprint §29/§46: "reality provenance").

`SpatialObjectRecord` (per-scene detected objects) carries the same
`provenance` field, defaulting to `INFERRED` — today's mock reconstruction
never populates real objects, so this is scaffolding a real perception
pipeline will use, not a UI that currently shows fabricated objects.

## Spatial Query Engine (platform spec §13/§21; blueprint §21)

`src/services/spatial-query.service.ts` answers structured questions with
real computation, never an LLM guess:

- `findSpaces(projectId, filter)` — filter by `kind`, `parentSpaceId`
  (hierarchy), or `hasRelation`/`relationTarget` (knowledge-graph lookup,
  e.g. "rooms with a balcony").
- `calculateHopDistance(projectId, fromId, toId)` — real breadth-first
  search over the `SpaceConnection` navigation graph. This reports hop
  count ("2 rooms away"), not a fabricated physical distance in meters —
  reporting a real metric honestly beats inventing a precise-looking fake
  one (blueprint §65).

`POST /api/projects/:id/query` and `GET .../query?fromSpaceId=&toSpaceId=`
expose this directly (blueprint §57: `POST /ai/query`). The AI concierge
(`MockAIProvider.answerConciergeQuestion`) is itself just the first
caller of this engine: it runs a deterministic (explicitly non-LLM)
intent parser — "which rooms have X" → `hasRelation` lookup, "how far is
X from Y" → `calculateHopDistance`, "where is X" → navigate — documented
in `src/providers/ai/mock-ai-provider.ts` as scaffolding for a real LLM to
later replace only the intent-parsing step, never the "trust the
database, not the model" data flow around it (blueprint §22).

## Model registry (§27 platform spec; §61 blueprint; §21 execution-plan doc)

A real `ModelVersion` table (not just free-text strings) — one row per
`(provider, model, version)` — is created/reused by
`resolveModelVersion()` in `src/jobs/pipeline.ts` and linked from both
`AIJob.modelVersionId` and `Reconstruction.modelVersionId`. `Reconstruction`
also keeps `provider`/`model`/`sourceJobId` directly for convenience.
This answers "which exact model produced this?" as a real foreign-key
lookup; comparing quality/cost/speed *across* providers/versions
(experiment tracking, execution-plan §62) is now a query over this
table's job/reconstruction children once a second provider exists to
compare against — the table is ready, the second data point isn't yet.

## Camera poses (execution-plan doc §5/§10; blueprint §7/§10/§29)

Camera trajectory is stored as real `CameraPose` rows (position,
rotation, timestamp, confidence, and `sourceAssetId` linking back to the
exact frame/photo it came from) rather than an opaque JSON array. This
directly serves the "reality provenance" principle both R&D documents
insist on: "why does the system think the camera was here?" is answerable
by following `sourceAssetId`, not just asserted. Today's mock engine
still synthesizes a placeholder ring (documented as such in
`mock-reconstruction-engine.ts`) — the schema is what changed, not the
mock's honesty about not doing real SfM/SLAM yet.

## Real asset variants (execution-plan doc §9: never conflate original vs derived)

Photo uploads (`src/services/asset.service.ts#uploadAsset`) now run
through `sharp` (already a dependency) to extract real width/height and
generate a real resized JPEG thumbnail, stored separately in the
`thumbnails` bucket and referenced via `Asset.thumbnailKey`. This is not
mocked — the UI (asset grid, space detail) now actually loads the smaller
thumbnail instead of the full-resolution original. Videos intentionally
get no thumbnail yet: that needs frame extraction (ffmpeg), which this
project doesn't depend on — leaving it null is the honest choice per §33
rather than faking a placeholder.

## Usage metering (execution-plan doc §63/§64)

A `UsageRecord` table (`src/services/usage.service.ts`) logs real events
as they happen: `storage_bytes` on upload, `ai_jobs` + `processed_seconds`
(actual wall-clock duration) on pipeline completion, `video_generations`
on AI Studio requests, and `experience_views` on the public
`experience_opened` analytics event. The Billing page
(`/billing`) shows a real 30-day summary alongside the existing
live-computed storage/project totals. This is metering infrastructure,
not a billing/invoicing system — no payment provider is integrated.

## Versioned API (execution-plan doc §53/§57/§117)

`/api/v1/*` is available as a rewrite to the existing `/api/*` routes
(`next.config.ts`), giving external/Enterprise consumers a stable
versioned contract without restructuring every route file — there is
exactly one consumer (this app's own frontend) today, so moving ~30
route handlers into a `v1/` directory for nothing to version against yet
would be the "overengineer the MVP" mistake both execution documents
explicitly warn against. If a real v2 is ever needed, that's when routes
move under `src/app/api/v1/**` and this rewrite is removed.

## Quality score (§22)

`src/services/quality-score.service.ts#computeQualityScore` derives
`geometry`/`coverage`/`visualQuality`/`navigation`/`overall` purely from
real, inspectable inputs — asset count, whether a reconstruction output
exists, hotspot count, connection count — never a random number. It also
returns plain-language `recommendations` (e.g. "capture more images",
"connect this space to a neighbor") which the UI renders directly,
matching the "Better capture recommended" pattern from §23.
