# Free-tier roadmap: a fully real, fully free test version

Goal: get every remaining mocked/blocked capability to a *real*
implementation using only free-tier services, for a test/demo version —
not a scale-ready production setup. This is a companion to
`docs/rd-blueprint-classification.md`; that document classifies each
component, this one plans the specific free path through them.

Every item below was verified against current provider documentation
(not assumed) before being included here — see the "Verified" note on
each.

## Already real and already free (no change needed)

| Component | Service | Cost |
|---|---|---|
| Hosting | Vercel Hobby | Free |
| Database | Neon Postgres (serverless) | Free tier |
| Object storage | Cloudflare R2 | Free (10GB, zero egress) |
| Auth/sessions | Built in-house | Free |
| Face redaction (photos) | YuNet ONNX via OpenCV.js, local | Free, no API |
| Capture quality (photo + video blur/exposure) | OpenCV.js + ffmpeg-static, local | Free, no API |
| Agent IA (concierge intent parsing) | NVIDIA NIM (`meta/llama-3.1-8b-instruct`) | Free tier (~40 req/min) |

## Phase A — fully automatable, fully free (NVIDIA NIM catalog)

### A1. Real scene understanding via a vision-language model — DONE
**Replaces:** `analyzeScene()`'s current "count the frames" placeholder.
**How:** NVIDIA's free catalog includes real VLMs (e.g.
`microsoft/phi-3.5-vision-instruct`) reachable through the same
OpenAI-compatible `/v1/chat/completions` endpoint already used for the
concierge, but with an `image_url` content block pointing at a real
R2 presigned URL instead of plain text. This is a genuine visual
analysis of the actual uploaded photo — not a text model guessing from
a filename.
**Shipped as:** `NvidiaAIProvider.analyzeScene`, fed up to 3 real R2
presigned photo URLs from `pipeline.ts`, reviews up to 2 of them and
reports only concrete visible issues (lighting, cut-off framing,
clutter, blur) as deduplicated findings merged into
`qualityScore.recommendations` — the same list already rendered on the
space detail page. 15 unit tests cover the happy path, dedup, the
sample cap, and every failure mode (bad API response, network error,
unparseable output) falling back to the plain frame-count check. Live
end-to-end verification (a real photo, a real NVIDIA key) still
pending — needs both a real API key and a deployed environment with
real object-storage URLs, since local-disk dev storage isn't reachable
by NVIDIA's API.
**Verified:** NVIDIA NIM VLM docs confirm `image_url` input over the
standard chat-completions API. [docs.nvidia.com/nim/vision-language-models]

### A2. Replace Replicate's depth estimation with a local, free model — DONE
**Replaces:** `ReplicateDepthEngine` (real, but needs a *paid*
Replicate account — the opposite of "totally free").
**Shipped as:** `LocalDepthEngine` (`RECONSTRUCTION_PROVIDER=local-depth`),
running Depth Anything V2 Small's int8 ONNX export
(`onnx-community/depth-anything-v2-small`, Apache-2.0, 27.3MB, committed
at `models/depth-estimation/`) via `onnxruntime-node` (prebuilt native
binaries, no compilation). ~400ms one-time session load + ~600ms/photo
at 280×280 input — fast enough for the same 6-photo/job cap Replicate
uses. Zero API calls, zero billing, no credentials.

Verification caught a real design mistake before it shipped: the first
approach (min-max normalize each photo's own depth output to 0-255,
mirroring how Replicate's rendered PNG looks) made a solid-grey flat
test image (stddev 66.6) statistically indistinguishable from a real
detailed room photo (stddev 64.0) — per-image normalization stretches
whatever tiny variation exists to fill the full range, destroying the
signal. Switched to rescaling the model's *raw* stddev onto the same
0-255-ish range instead, calibrated against three real probes (real
room ~1.09, solid flat ~0.62, close crop ~1.30 on the raw scale) —
correctly separated in a full end-to-end run through the actual
`ReconstructionEngine` interface (real room: 48.2, flat: 14.7).
**Verified:** Hugging Face's free Inference API was checked as a
simpler alternative and rejected — it's now credit-limited
($0.10/month) and gives no reliable guarantee for a specific model, so
it's not a stable "totally free" foundation. Local ONNX has no such
risk. [klymentiev.com/blog/huggingface-inference-api]

### A3. Real voice (STT/TTS) for the concierge
**Replaces:** nothing existing — this is new capability, currently
"BUY, not started" in the blueprint.
**How:** NVIDIA hosts real Riva ASR/TTS models free at
build.nvidia.com/explore/speech (~40 languages).
**Effort:** medium. New `VoiceProvider` interface (mirrors the existing
`AIProvider`/`ReconstructionEngine` pattern), wired into the concierge
UI as an optional mic input / spoken response.
**Verified:** build.nvidia.com/explore/speech lists Riva ASR/TTS/NMT
NIMs as free-tier accessible. [nvidia.com/en-us/ai-data-science/products/riva]

## Phase B — real, free, but semi-manual (no clean hosted API exists)

These need sustained GPU/CPU compute per job (minutes, not
milliseconds) — no provider hosts this as a simple pay-as-you-go API,
free or otherwise, including NVIDIA. The honest free path is real
compute on a free interactive platform, run by a person, not a
push-button pipeline. That's a legitimate "test version" workflow, just
not yet a polished product feature.

### B1. Real camera pose (structure-from-motion)
**Replaces:** the synthesized placeholder camera-position ring.
**How:** COLMAP (open source, the field standard) run against a small
test scene's photos. Two free options:
- GitHub Actions runner (free minutes on this repo) — CPU-only, slow,
  but fully scriptable: a workflow takes photos from R2, runs COLMAP,
  writes real camera poses back to the database. Fully automatable,
  just slow (CPU SfM on a handful of photos: minutes, not seconds).
- Google Colab / Kaggle free T4 GPU notebook — faster, but manual: a
  person uploads the photo set, runs the notebook, downloads the
  camera-pose output, and it's imported back into the app.
**Effort:** high. Recommend starting with the GitHub Actions path since
it's the only one that stays fully automated end-to-end.
**Verified:** multiple maintained open-source COLMAP/gsplat Colab
notebooks confirm this is a well-trodden, working free pattern.
[docs.gsplat.studio/main/examples/colmap.html]

### B2. Real 3D Gaussian Splatting
**Replaces:** nothing existing yet — this is the actual "digital twin"
payoff the platform doesn't have today.
**How:** `gsplat` (open source, CUDA) trained on the COLMAP output from
B1, on a free Colab/Kaggle T4 GPU notebook. Output is a real `.ply`/
splat file, uploaded back into the app's storage and served by an
existing open-source WebGL splat viewer.
**Effort:** high, and the least automatable step in this whole plan —
realistically a manual notebook run per test scene for now, not a job
the app itself triggers.
**Verified:** several actively maintained free-Colab-T4
Gaussian-Splatting repos exist and are reported working today.
[github.com/tianxingleo/3DGS-Colab-Free-T4]

## Explicitly out of scope even at $0

**Real video face redaction.** Already benchmarked this session:
YuNet in WASM runs at ~574ms/frame with no GPU, making per-frame video
processing infeasible under Vercel's timeout even chunked across cron
ticks (a 30s clip would take 5+ hours). A free GPU notebook doesn't
fix this either — it would need a video-upload-to-Colab pipeline that's
a bigger, separate undertaking than anything else in this document, for
a feature that already has an honest interim warning shipped. Not
included in this "free test version" plan; revisit only if the GPU/
persistent-worker infra decision gets made for real (same category as
Phase B, but for a feature currently working "well enough" via a
warning label rather than a missing core capability).

## Suggested order

1. **A1 (vision scene understanding)** — no new infra, extends the
   NVIDIA integration just shipped, quick to verify.
2. **A2 (local depth model)** — directly removes the one remaining
   *paid* dependency (Replicate), converting a "blocked on billing"
   item into "done, free."
3. **A3 (voice)** — net-new capability, self-contained, no dependency
   on the reconstruction work.
4. **B1 (COLMAP camera pose)** — prerequisite for B2, meaningfully
   harder, worth its own checkpoint before committing to B2.
5. **B2 (Gaussian Splatting)** — the biggest single piece, and the one
   most worth pausing on to confirm scope (which test scene, how
   manual is acceptable) before starting.

## Honest limits of this plan

- NVIDIA's free tier is rate-limited (~40 req/min) and not officially
  guaranteed — fine for a test version, not for real user traffic.
- B1/B2 are not push-button from the app's UI; they're real, working,
  free, but manual/semi-manual pipelines appropriate for a *test*
  version, not the polished one-click experience the product should
  eventually have once a real GPU budget exists.
- None of this changes the video-redaction conclusion from earlier this
  session — that gap stays open regardless of budget, because the
  blocker is architectural (execution time), not access to a model.
