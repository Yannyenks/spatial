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
| Capture quality engine (blur/exposure/motion/coverage scoring) | **HYBRID** | Blur/exposure/motion detection has mature OpenCV-based heuristics (open source) to bolt onto our own upload pipeline; the "coverage" and "which area is missing" logic is closer to research — needs real camera-pose data first. |
| Camera pose estimation / SLAM | **OPEN SOURCE → HYBRID** | COLMAP, ORB-SLAM3, or a managed structure-from-motion service exist and are mature; wrap one behind `ReconstructionEngine.analyze()`. Real-time on-device SLAM (ARKit/ARCore) is **BUY/OPEN SOURCE** per platform, already solved by Apple/Google. |
| Depth estimation (monocular/stereo/LiDAR fusion) | **OPEN SOURCE → HYBRID** | Monocular depth models (e.g. Depth Anything, MiDaS) are open source and good enough to start; multi-source fusion with confidence weighting is our own glue code (**BUILD**) once a source is chosen. |
| Dynamic object / people removal | **OPEN SOURCE** | Off-the-shelf segmentation models (e.g. Segment Anything) handle masking; the reconstruction-time in-painting/removal step is **HYBRID**. |
| Face redaction (photos) | **OPEN SOURCE — done** | `src/services/redaction.service.ts`, wired into every photo upload. OpenCV.js (WASM, no native build step) + the YuNet ONNX face detector from the official opencv_zoo repo (BSD-licensed, ~230KB, bundled in `models/face-detection/`). `@tensorflow/tfjs-node` was tried first and rejected — it requires MSVC to compile its native addon, unavailable in this environment; `@vladmandic/face-api`'s pure-JS build was also tried and found too fragile. Verified against a real photo before shipping: 90.3% confidence, correctly boxed. |
| Face redaction (video) | **DEFERRED to Phase 2 — interim warning shipped instead** | Not a simple extension of the photo path: a 10s/30fps clip is ~300 frames, far too slow to process synchronously in the upload request (photos are); it needs an async job, per-frame detection with tracking (to stop the blur box flickering frame to frame), and re-encoding via ffmpeg — which isn't bundled in the deployed app today and doesn't ship on Vercel without extra work (`ffmpeg-static` or similar, size/timeout constraints). Building a one-off serverless version of this now would be thrown away once real GPU job orchestration (see "GPU job orchestration" below) exists for reconstruction anyway — same underlying infra need, so do it once, in Phase 2. Interim measure shipped in this pass instead: `uploadAsset()` returns a `privacyWarning` on every video asset, surfaced visibly in the capture UI (`src/components/capture/capture-manager.tsx`) telling the uploader to review manually before publishing — an honest "not covered yet," not a silent gap. |
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
