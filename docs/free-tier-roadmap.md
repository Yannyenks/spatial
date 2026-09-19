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

### A3. Real voice (STT/TTS) for the concierge — DONE
**Replaces:** nothing existing — new capability, previously "BUY, not
started" in the blueprint.
**Shipped as:** `VoiceProvider` (`src/providers/voice/`), `nvidia/parakeet-tdt-0.6b`
for ASR and `nvidia/magpie-tts-multilingual` for TTS, wired into the
public experience viewer's concierge drawer as a mic button (push-to-
talk, fills the question box with the real transcript rather than
auto-submitting, so a bad transcription is easy to catch) and a speaker
icon per assistant answer.

Two real, non-obvious integration details found only by testing live,
not from the docs:
- These Riva NIMs aren't behind the shared `integrate.api.nvidia.com`
  endpoint the chat/vision models use — each is deployed at its own
  per-model NVCF invocation URL (`NVIDIA_ASR_URL`/`NVIDIA_TTS_URL`),
  only visible on that exact model's build.nvidia.com page.
- The two endpoints' language codes are **not symmetric**: this ASR
  deployment 404s on `en-US` and plain `en`, only `en-GB` works; TTS
  uses `en-US`. Found by testing both directly, not assumed from the
  (identical-looking) request shape.

Verified with a genuine round trip, not two isolated calls: synthesized
"Welcome to the hotel lobby. The pool is two rooms away." through TTS,
fed the resulting WAV back into ASR, got the identical text back. Also
verified through the actual UI end-to-end (real mic recording via a
fake test audio device, real speaker playback, real concierge answer)
— which surfaced and fixed two real, pre-existing bugs unrelated to the
voice feature itself:
1. `Permissions-Policy: microphone=()` (site-wide, set before this
   feature existed) blocked microphone access outright — changed to
   `microphone=(self)`.
2. The CSRF middleware blocked these (and the pre-existing `/ai` and
   `/events`) public endpoints whenever the visitor's browser happened
   to also carry a session cookie (e.g. an owner previewing their own
   published listing while logged in) — none of `/api/experience/**`
   ever checks the session cookie for authorization, so the whole
   prefix is now exempt from CSRF.
**Verified:** build.nvidia.com/explore/speech lists Riva ASR/TTS/NMT
NIMs as free-tier accessible; both endpoints exercised directly against
a real account. [nvidia.com/en-us/ai-data-science/products/riva]

## Phase B — real, free, but semi-manual (no clean hosted API exists)

These need sustained GPU/CPU compute per job (minutes, not
milliseconds) — no provider hosts this as a simple pay-as-you-go API,
free or otherwise, including NVIDIA. The honest free path is real
compute on a free interactive platform, run by a person, not a
push-button pipeline. That's a legitimate "test version" workflow, just
not yet a polished product feature.

### B1. Real camera pose (structure-from-motion) — DONE
**Replaces:** the synthesized placeholder camera-position ring.
**Shipped as:** `.github/workflows/estimate-camera-pose.yml`, dispatched
from a new "Estimate real camera pose" button on the space detail page
(`src/services/camera-pose.service.ts`, `CameraPoseJob` model). Fully
automated end to end on GitHub's free CPU-only runners: `apt-get install
colmap` (no build-from-source needed), fetches the space's real photos
via a shared-secret-authenticated endpoint, runs
`feature_extractor` → `exhaustive_matcher` → `mapper`, converts the
sparse model to TXT, and a small Python script
(`scripts/colmap/report_result.py`) converts COLMAP's quaternion +
translation output into real world-space camera centers and Euler
rotations (`C = -Rᵀt`, the standard SfM convention — verified against
known test cases, not just assumed) before reporting back to the app.

Found and fixed a real, pre-existing product gap while scoping this:
`CameraPose` rows have been written by every reconstruction engine
since the mock, but displayed nowhere — so a minimal 3D viewer
(`src/components/spaces/camera-pose-viewer.tsx`, vanilla three.js) shipped
first, verified against a real rendered screenshot, so this work has
something to actually show.

Deliberately NOT wired into the main synchronous AIJob pipeline — COLMAP
takes several minutes even on a small photo set, which no pipeline stage
or serverless request should block on. Needs a GitHub PAT
(`GITHUB_DISPATCH_TOKEN`) with `actions:write` on this repo, which only
the repo owner can create — the one piece of this step that isn't
purely automatable from here.
**Verified:** COLMAP's `apt install colmap` availability on Ubuntu
confirmed via its own install docs; the quaternion/camera-center math
verified against known identity/rotation test cases before being
trusted with real COLMAP output.
[colmap.github.io/install.html] [docs.gsplat.studio/main/examples/colmap.html]

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
