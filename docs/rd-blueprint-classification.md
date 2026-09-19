# R&D Blueprint: build/buy/open-source/research classification

The "AI Spatial Engine — Blueprint R&D" document (perception, neural
representation, SLAM, Gaussian Splatting, generative world layer, VR/XR,
proprietary models…) is a multi-year research agenda, not a sprint. Its
own §67 asks for exactly one thing before any of it is built: a
classification of each component as **BUILD** (write it ourselves now),
**BUY** (a commercial API/service), **OPEN SOURCE** (integrate an existing
library/model), **HYBRID** (open-source core + our own tuning/glue), or
**RESEARCH** (no adequate off-the-shelf solution; needs real R&D
investment, likely GPU training). This document is that classification.
Nothing in this file has been implemented as production code — it is
input to a roadmap decision, per §67's instruction not to build the whole
system immediately.

## How to read this

Components are grouped by the blueprint's own architecture layers.
"Status today" reflects what actually exists in this codebase (see
`docs/reconstruction.md` and `docs/ai-pipeline.md` for the parts that are
real): mostly clean interfaces with a mock implementation, plus — as of
this pass — a real Semantic World Model and Spatial Query Engine (no ML
involved, so no classification dilemma there; they're already **BUILD**,
done).

## Capture & perception

| Component | Classification | Notes |
|---|---|---|
| Capture upload/normalization pipeline (photo/video ingestion, validation) | **BUILD** — done | `src/services/asset.service.ts`, `src/jobs/pipeline.ts`. No ML required. |
| Capture quality engine (blur/exposure/motion/coverage scoring) | **HYBRID — blur/exposure slice done (photo + video)** | `src/services/capture-quality.service.ts` (photos, wired into `asset.service.ts`, persisted on `Asset.isBlurry`/`isUnderexposed`/`isOverexposed`) and `src/services/video-quality.service.ts` (videos: `ffmpeg-static` samples up to 8 frames from the first ~24s of a clip, reuses the exact same classical analysis, persisted on `Asset.qualitySampledFrames`/`qualityFlaggedFrames`). Classical OpenCV.js heuristics — variance-of-Laplacian for blur (Pech-Pacheco et al., 2000), mean brightness for under/overexposure — verified against real and deliberately degraded (blurred/darkened/brightened, and for video: a synthetic sharp-pattern clip vs. a blurred one) inputs before shipping; correctly flagged the bad ones and left the clean ones alone. Advisory only, never blocks the upload. Real signal from both feeds `quality-score.service.ts`'s pooled `visualQuality` sub-score, the same pattern depth stats feed into `geometry`. Hit and fixed a real deployment bug along the way: `ffmpeg-static` resolves its binary path from `__dirname`, which breaks under webpack bundling and fails every spawn silently — fixed via `serverExternalPackages: ["ffmpeg-static"]` in `next.config.ts`, caught only because this was verified through a real E2E upload, not just a unit-level check. "Coverage / which area is missing" is still not covered — needs real camera-pose data first (see Camera pose estimation row below), which doesn't exist yet. |
| Real per-photo scene review (lighting/framing/clutter) | **BUY (LLM API) — done, free tier** | `NvidiaAIProvider.analyzeScene` (`src/providers/ai/nvidia-ai-provider.ts`), a genuine vision-language model (`microsoft/phi-3.5-vision-instruct`, free on NVIDIA's NIM catalog) looking at up to 2 real, publicly-resolvable photo URLs per job and reporting only concrete visible issues, deduplicated, merged into the same `qualityScore.recommendations` the space detail page already renders. Distinct from "capture quality" below (classical CV, no model) and from "coverage / which area is missing" (needs camera pose, still not done) — this is qualitative human-style review, not geometric analysis. Only produces real findings against a deployed environment with real object-storage URLs; local-disk dev storage isn't reachable by the API and fails closed to the plain frame-count check instead. |
| Camera pose estimation / SLAM | **OPEN SOURCE → HYBRID** | COLMAP, ORB-SLAM3, or a managed structure-from-motion service exist and are mature; wrap one behind `ReconstructionEngine.analyze()`. Real-time on-device SLAM (ARKit/ARCore) is **BUY/OPEN SOURCE** per platform, already solved by Apple/Google. |
| Depth estimation (monocular) | **OPEN SOURCE — done, two engines** | `src/providers/reconstruction/replicate-depth-engine.ts` (`RECONSTRUCTION_PROVIDER=replicate`, pay-per-use hosted GPU inference) and `src/providers/reconstruction/local-depth-engine.ts` (`RECONSTRUCTION_PROVIDER=local-depth`, free-tier plan step A2 — docs/free-tier-roadmap.md). Both run Depth Anything V2; the local engine runs the same model family's int8 ONNX export entirely locally via `onnxruntime-node` (prebuilt native binaries, no compilation needed — this environment still can't compile ML runtimes from source, same constraint as face redaction, but this package ships prebuilt) — zero API calls, zero billing. Verified end to end against real images before wiring in: a naive per-image min-max normalization was tried first and rejected (a solid-grey flat test image came out statistically indistinguishable from a real detailed room — 66.6 vs 64.0 — the opposite of a useful signal); using the model's raw stddev rescaled onto the same range instead correctly separated them (real room 48.2 vs flat 14.7, real reconstruction run through the actual `ReconstructionEngine` interface, not just the model in isolation). Both feed the same real geometry sub-score in `quality-score.service.ts`. Honest about shared limits: no camera pose/extrinsics (needs multi-view SfM, not done), video not covered, capped at 6 photos/job for latency. |
| Stereo/LiDAR fusion, multi-view SfM/SLAM (camera pose) | **OPEN SOURCE → HYBRID — not started** | COLMAP/ORB-SLAM3 or a managed structure-from-motion service; this is what would replace the synthesized placeholder camera-position ring with real measured poses. Separate, larger piece of work from the depth-estimation slice above. |
| Dynamic object / people removal | **OPEN SOURCE** | Off-the-shelf segmentation models (e.g. Segment Anything) handle masking; the reconstruction-time in-painting/removal step is **HYBRID**. |
| Face redaction (photos) | **OPEN SOURCE — done** | `src/services/redaction.service.ts`, wired into every photo upload. OpenCV.js (WASM, no native build step) + the YuNet ONNX face detector from the official opencv_zoo repo (BSD-licensed, ~230KB, bundled in `models/face-detection/`). `@tensorflow/tfjs-node` was tried first and rejected — it requires MSVC to compile its native addon, unavailable in this environment; `@vladmandic/face-api`'s pure-JS build was also tried and found too fragile. Verified against a real photo before shipping: 90.3% confidence, correctly boxed. |
| Face redaction (video) | **BLOCKED on GPU/persistent-worker infra — interim warning shipped instead** | Benchmarked, not just estimated: YuNet (the same detector used for photos) runs at ~574ms/frame in OpenCV.js WASM (no GPU, no threads) against real extracted video frames. A 10s/30fps clip (300 frames) is ~172s of detection alone — 17x a Vercel Hobby function's 10s timeout. Chunked across the existing 8s-budgeted cron (see "GPU job orchestration" below) that's ~14 frames per 5-minute tick, so a 30s video would take 5+ hours end to end. Downsampling to make the total time tractable (e.g. 1fps with the blur box held between samples) would leave a moving person uncovered for most of each second — a false sense of protection, not a real one, so it was rejected rather than shipped looking like it works. This isn't a model problem (open-source options like `deface`/CenterFace use the same class of lightweight ONNX detector already in use here) — it's the lack of GPU/persistent-worker infra, the same category of blocked decision as Replicate and the 3D reconstruction engine. Revisit together if/when that infra decision is made. Interim measure shipped instead: `uploadAsset()` returns a `privacyWarning` on every video asset, surfaced visibly in the capture UI (`src/components/capture/capture-manager.tsx`) telling the uploader to review manually before publishing — an honest "not covered yet," not a silent gap. |
| Plate/document privacy redaction | **OPEN SOURCE / BUY — not started** | No equivalently mature free model exists in the JS/WASM ecosystem the way YuNet does for faces; the realistic options are a paid API (e.g. Plate Recognizer) or more R&D, not a quick follow-on to the face-redaction work above. Track as separate scope rather than assuming it comes for free once faces are handled. |

## Reconstruction & representation

| Component | Classification | Notes |
|---|---|---|
| `ReconstructionEngine` / `AIProvider` / `VideoGenerationProvider` interfaces + provider registry | **BUILD** — done | The actual moat-enabling piece per the blueprint's own §68 ("never be prisoner to one model") — already shipped and is the reason everything below can be swapped in later without a rewrite. |
| Mesh reconstruction (walls/floors/collision geometry) | **OPEN SOURCE** | Photogrammetry toolchains (e.g. Meshroom, Open3D) are mature for this. |
| 3D Gaussian Splatting | **OPEN SOURCE → HYBRID** | Reference implementations (e.g. gsplat, Nerfstudio) exist and are the correct starting point per the blueprint's own §6/§15; **HYBRID** because compression/streaming/quality tuning for our specific hospitality use case is real, ongoing work, not a one-time integration. |
| NeRF / neural fields (alternate representations) | **RESEARCH** (optional) | Only worth pursuing if Gaussian Splatting's known weaknesses (reflective/transparent surfaces, §32) turn out to matter more than expected for real hotel scenes — evaluate before investing. |
| Multi-representation fusion (mesh + splat + semantic graph in one Digital Twin) | **BUILD** | This is architecture, not ML — already scaffolded (`Scene`/`SpatialObjectRecord`/`Reconstruction` side by side) and needs to be extended once a real geometry/neural provider exists. |
| Uncertainty/confidence modeling | **BUILD** — partially done | `SpatialObjectRecord.confidence` and `SpatialRelation.provenance` exist; a real per-voxel/per-object confidence map from an actual reconstruction pipeline is **RESEARCH** once a real engine exists. |

## Semantic understanding & spatial intelligence

| Component | Classification | Notes |
|---|---|---|
| Semantic World Model (containment hierarchy + relation graph) | **BUILD** — done | `Space.parentSpaceId`, `SpatialRelation`. No ML needed — this is a data model, and it's shipped. |
| Structured Spatial Query Engine (filter/search/BFS distance) | **BUILD** — done | `src/services/spatial-query.service.ts`. Deliberately never delegates to a model — this is the blueprint's own §21/§65 principle ("never let the LLM invent distances") already satisfied. |
| Open-vocabulary object detection (§19 blueprint) | **OPEN SOURCE → HYBRID** | Open-vocabulary detectors (e.g. Grounding DINO, CLIP-based) exist; wiring their (uncertain) output into `SpatialObjectRecord` with honest confidence scores is our own work. |
| AI agent / intent parsing | **BUY (LLM API) + BUILD (tool layer) — done** | `src/providers/ai/nvidia-ai-provider.ts` (`AI_PROVIDER=nvidia`), calling NVIDIA's hosted NIM catalog (free tier, OpenAI-compatible). Confirms the tool-call architecture's own thesis: the intent-parsing step (regex → real LLM) was the only thing that changed — `executeIntent()`, extracted into `concierge-intent.ts` so both providers share it, is byte-for-byte the same code path deciding what's real, with the model's output validated before it ever reaches that function. Falls back to the same deterministic regex parser on any API failure or malformed response, verified with unit tests covering each failure mode (rate limit, network error, unparseable JSON, wrong shape) plus the original mock-provider behavior tests. |
| Voice (STT/TTS) | **BUY** | Commercial STT/TTS APIs are mature and not a differentiator; building our own here would be pure cost with no moat benefit. |

## Rendering, streaming, generative & XR

| Component | Classification | Notes |
|---|---|---|
| Web viewer (current: spatial gallery) | **BUILD** — done (non-3D) | `src/components/experience/experience-viewer.tsx`. Real-time 3D/Gaussian-Splat rendering in the browser is **OPEN SOURCE → HYBRID** (existing WebGL splat renderers) once a real reconstruction exists — no reason to build a renderer from scratch. |
| Camera-pose visualization (internal, not the public experience viewer) | **BUILD** — done | `src/components/spaces/camera-pose-viewer.tsx`, a minimal vanilla-three.js scene (grid + orientation markers + OrbitControls) on the space detail page. Fixes a real, previously-undiscovered gap found while scoping B1 (docs/free-tier-roadmap.md): `CameraPose` rows have been written by every reconstruction engine since the mock, but read by nothing — genuinely invisible until now. Distinguishes placeholder (synthesized ring, every engine so far) from real (structure-from-motion) poses by color and label, so B1's COLMAP work has something to actually show. Verified visually via a real screenshot of a running dev server, not just a type-check. |
| LOD / streaming engine | **HYBRID** | Standard 3D-engine concepts (glTF LOD tooling, CDN-based progressive loading) apply directly; the "which LOD for this device/connection" policy is our own logic. |
| Cinematic camera path generation | **RESEARCH** (with an OPEN SOURCE starting point) | Procedural camera-path libraries exist for games; producing genuinely cinematic, scene-aware paths from a real Digital Twin is where real R&D investment is needed if this becomes a priority. |
| Generative video/image (marketing content) | **BUY** | Commercial image/video generation APIs are the pragmatic choice; our job is constraining them with the Digital Twin's real data (blueprint §54: "reality-consistent generation"), which is `src/providers/video` — already interfaced, mock today. |
| Spatial audio | **OPEN SOURCE** | Web Audio API spatialization primitives exist; low priority until the viewer is 3D. |
| WebXR / VR / AR | **OPEN SOURCE → HYBRID** | Three.js/Babylon.js have working WebXR support; meaningful integration work remains but no research gap. Correctly sequenced last in the blueprint's own roadmap (§63 R6). |

## Platform / infra (mostly already decided correctly by the spec itself)

| Component | Classification | Notes |
|---|---|---|
| Async job queue, multi-tenancy, quotas, auth, storage abstraction | **BUILD** — done | Foundation phase, already shipped. |
| GPU job orchestration / autoscaling | **BUY** | Managed GPU job platforms (e.g. Modal, Replicate, RunPod, or a cloud provider's own batch/GPU service) beat operating a GPU cluster ourselves at this stage — squarely "commodity infrastructure" per the platform spec's own §25/§31. |
| Cost tracking per job | **BUILD** — partially done | `AIJob.costCents` field exists; populating it requires whichever GPU/BUY provider is chosen to report cost, then this becomes real. |
| Benchmark suite / golden dataset / experiment tracking | **BUILD** (process, not tech) | No new technology needed — this is discipline: capture a fixed set of reference scenes and score every pipeline change against them before merging. Worth doing as soon as a real reconstruction engine exists, not before. |

## Bottom line

Everything genuinely available off-the-shelf today (SLAM, depth
estimation, segmentation, Gaussian Splatting, LLM APIs, STT/TTS, video
generation, GPU orchestration) is marked **BUY**/**OPEN SOURCE**/**HYBRID**
on purpose — building any of it from scratch right now would be exactly
the "reinvent a mature technology" mistake the blueprint itself warns
against (§41). The pieces marked **BUILD** are the ones no vendor sells
because they're specific to this product: the provider-abstraction
architecture, the multi-tenant platform, the Semantic World Model, and
the Spatial Query Engine — which, per the blueprint's own §42
("Proprietary Moat") and this session's implementation, are exactly the
layer already built.
