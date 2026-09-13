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

| Interface              | Env var                 | Mock implementation             |
| ----------------------- | ------------------------ | -------------------------------- |
| `StorageProvider`        | `STORAGE_PROVIDER`         | `LocalStorageProvider` (disk)      |
| `ReconstructionEngine`   | `RECONSTRUCTION_PROVIDER`  | `MockReconstructionEngine`         |
| `AIProvider`             | `AI_PROVIDER`               | `MockAIProvider`                    |
| `VideoGenerationProvider` | `VIDEO_PROVIDER`            | `MockVideoGenerationProvider`       |

To add a real implementation: implement the interface in a new file next
to the mock, register it in that folder's `index.ts` under a new env
value, and set the env var. No other file changes.

## Job observability (§31)

Every `AIJob` row already carries the fields a real observability system
would want to report: `provider`, `model`, `startedAt`, `completedAt`,
`durationMs`, `costCents` (currently unpopulated by the mock provider,
ready for a real one to fill in), and `status`/`stage`/`error`. Wiring
this into a metrics/tracing backend is a matter of emitting these same
fields from `src/jobs/queue.ts`, not redesigning the schema.
