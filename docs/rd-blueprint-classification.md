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
| Capture quality engine (blur/exposure/motion/coverage scoring) | **HYBRID — blur/exposure slice done** | `src/services/capture-quality.service.ts`, wired into every photo upload (`asset.service.ts`) and persisted on `Asset.isBlurry`/`isUnderexposed`/`isOverexposed`. Classical OpenCV.js heuristics — variance-of-Laplacian for blur (Pech-Pacheco et al., 2000), mean brightness for under/overexposure — verified against a real photo and deliberately degraded (blurred/darkened/brightened) variants before shipping; correctly flagged all three and left the original clean. Advisory only, never blocks the upload. The real per-photo flags also now feed `quality-score.service.ts`'s `visualQuality` sub-score (real clean-photo fraction, replacing the old pure coverage-based guess when samples exist), the same pattern depth stats already feed into `geometry`. Motion detection and "coverage / which area is missing" logic are still not covered — the latter needs real camera-pose data first (see Camera pose estimation row below), which doesn't exist yet. |
| Camera pose estimation / SLAM | **OPEN SOURCE → HYBRID** | COLMAP, ORB-SLAM3, or a managed structure-from-motion service exist and are mature; wrap one behind `ReconstructionEngine.analyze()`. Real-time on-device SLAM (ARKit/ARCore) is **BUY/OPEN SOURCE** per platform, already solved by Apple/Google. |
| Depth estimation (monocular) | **OPEN SOURCE — first slice done** | `src/providers/reconstruction/replicate-depth-engine.ts` (`RECONSTRUCTION_PROVIDER=replicate`). Runs Depth Anything V2 (chenxwh/depth-anything-v2, 3.8M+ runs) via Replicate — pay-per-use hosted GPU inference, no cluster of our own (this environment can't compile native ML runtimes locally, same constraint hit building face redaction). Real per-photo depth maps feed a real geometry sub-score in `quality-score.service.ts`, replacing the pure asset-count heuristic when samples exist. Honest about its limits: no camera pose/extrinsics (needs multi-view SfM, not done), video not covered (no frame-extraction step exists yet), capped at 6 photos/job for cost and latency. |
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
| AI agent / intent parsing | **BUY (LLM API) + BUILD (tool layer)** | The tool-call architecture (`intent → typed tool → spatial engine → validated result`) is already built and tested against a rule-based stand-in parser (`MockAIProvider`); swapping in a real LLM for the intent-parsing step only is a **BUY** decision (a hosted LLM API) that requires no change to the validated-result contract. |
| Voice (STT/TTS) | **BUY** | Commercial STT/TTS APIs are mature and not a differentiator; building our own here would be pure cost with no moat benefit. |

## Rendering, streaming, generative & XR

| Component | Classification | Notes |
|---|---|---|
| Web viewer (current: spatial gallery) | **BUILD** — done (non-3D) | `src/components/experience/experience-viewer.tsx`. Real-time 3D/Gaussian-Splat rendering in the browser is **OPEN SOURCE → HYBRID** (existing WebGL splat renderers) once a real reconstruction exists — no reason to build a renderer from scratch. |
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
