# AI processing pipeline

## Why async, and how

Uploading media and reconstructing a space can take anywhere from
seconds to minutes with a real model. No HTTP request in this codebase
ever blocks on that work:

- `POST /api/projects/:id/spaces/:spaceId/process` only validates input
  and inserts an `AIJob` row with `status: QUEUED`, then returns
  `202 Accepted`.
- A separate poller (`src/jobs/runner.ts`) claims the oldest queued job
  every 1.5s (`claimNextQueuedJob` in `src/jobs/queue.ts`, which uses an
  optimistic `updateMany` guard so two workers can never double-claim the
  same job) and runs it through `src/jobs/pipeline.ts#runPipelineJob`.
- The web app and the worker can run in the **same** process (dev
  convenience — see `src/instrumentation.ts`, which starts the poller
  once when the Next.js server boots) or in **separate** processes
  (`npm run worker` — the recommended production topology, set
  `DISABLE_INPROCESS_WORKER=1` on the web process so it doesn't also
  poll).

## Stages

```
QUEUED
  → MEDIA_VALIDATION        (real: fails if no assets exist for the space)
  → CAMERA_ANALYSIS         (placeholder pass-through — no real motion analysis yet)
  → FRAME_EXTRACTION        (placeholder pass-through — treats each uploaded asset as a frame)
  → SCENE_UNDERSTANDING     (calls AIProvider.analyzeScene)
  → SPATIAL_RECONSTRUCTION  (calls ReconstructionEngine.reconstruct, persists Scene + Reconstruction)
  → QUALITY_OPTIMIZATION    (computes a real QualityScore from asset/hotspot/connection counts)
  → EXPERIENCE_GENERATION   (ensures a draft Experience row exists)
  → COMPLETED | FAILED
```

Every transition is written to the `AIJob` row (`stage`, `progress`,
timestamps) before the next stage starts, and `progress` is derived from
`(completed stages / total stages) * 100` — never a hardcoded or random
number (product spec §33: "do not simulate AI").

On failure, a structured `JobError` (`code`, `message`, `recoverable`,
`suggestedAction`) is stored so the UI can explain what happened and what
to do next (§35), instead of a generic "Something went wrong."

## Providers

Three provider interfaces exist under `src/providers/`, each resolved by
an env var and a small registry (`getXProvider()` in each folder's
`index.ts`) so nothing in a route, service or component imports a
specific implementation directly:

| Interface              | Env var                 | Mock implementation             | Real implementation |
| ----------------------- | ------------------------ | -------------------------------- | -------------------- |
| `StorageProvider`        | `STORAGE_PROVIDER`         | `LocalStorageProvider` (disk)      | `S3StorageProvider` (`s3`, R2-compatible) |
| `ReconstructionEngine`   | `RECONSTRUCTION_PROVIDER`  | `MockReconstructionEngine`         | `ReplicateDepthEngine` (`replicate`) |
| `AIProvider`             | `AI_PROVIDER`               | `MockAIProvider`                    | `NvidiaAIProvider` (`nvidia`) |
| `VideoGenerationProvider` | `VIDEO_PROVIDER`            | `MockVideoGenerationProvider`       | — not built yet |

To add a real implementation: implement the interface in a new file next
to the mock, register it in that folder's `index.ts` under a new env
value, and set the env var. No other file changes.

### `AIProvider`: mock vs. `nvidia`

`AI_PROVIDER=nvidia` (`src/providers/ai/nvidia-ai-provider.ts`) calls
NVIDIA's hosted NIM catalog (build.nvidia.com, OpenAI-compatible API,
free tier available — needs `NVIDIA_API_KEY`) for three things:

- **Concierge intent classification.** The model only decides *which*
  typed tool call (`navigate` / `search_by_relation` /
  `calculate_distance` / `unknown`) a question maps to, extracting the
  same shape `MockAIProvider`'s regex parser would. That shape is then
  run through `executeIntent()` (`src/providers/ai/concierge-intent.ts`,
  shared by both providers) against the real spatial graph — the model
  never sees or returns a distance, a matched room, or an answer text
  directly, so it cannot invent one (§16, §65). A malformed or invalid
  response, a non-2xx API response, or a network error all fall back to
  the exact same deterministic regex parser the mock provider uses,
  logged as a warning — the concierge degrades, it never breaks.
- **Space description copy.** One constrained prompt with only the
  real facts already known (name, kind, object count) asking for one
  marketing sentence — nothing for the model to hallucinate a new
  amenity from. Falls back to the mock's template string on failure.
- **Real per-photo scene review**, via a genuine vision-language model
  (`microsoft/phi-3.5-vision-instruct` by default — a separate model
  from the text one, since a text-only model cannot accept image
  content at all). `pipeline.ts` generates real, publicly resolvable
  URLs (signed R2 URLs in production) for up to `MAX_SCENE_SAMPLE_PHOTOS`
  (3) photos and passes them as `sampleImageUrls`; the provider looks at
  up to `MAX_SCENE_VISION_SAMPLES` (2) of them and asks the model to
  report only concrete, visible issues (poor lighting, a cut-off view,
  clutter, motion blur) as a short JSON array, deduplicated across
  photos. Findings merge into the same `qualityScore.recommendations`
  list already rendered on the space detail page — no separate UI, and
  no real signal computed but never actually shown. A `localhost` URL
  from local-disk dev storage isn't reachable by NVIDIA's API and fails
  closed the same way any other request failure does (empty findings,
  not a crash); this only produces real findings against a deployed
  environment with real object-storage URLs.

`MockAIProvider.analyzeScene` — and `NvidiaAIProvider` when no
`sampleImageUrls` are supplied or every vision call fails — keeps the
plain, honest low-frame-count check rather than fabricating a vision
analysis that never happened (§33).

## Job observability (§31)

Every `AIJob` row already carries the fields a real observability system
would want to report: `provider`, `model`, `startedAt`, `completedAt`,
`durationMs`, `costCents` (currently unpopulated by the mock provider,
ready for a real one to fill in), and `status`/`stage`/`error`. Wiring
this into a metrics/tracing backend is a matter of emitting these same
fields from `src/jobs/queue.ts`, not redesigning the schema.
