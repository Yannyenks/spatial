# Training a real Gaussian Splat for free (manual step)

Free-tier roadmap step B2 (`docs/free-tier-roadmap.md`). The app can
**store and render** a real Gaussian Splat file the moment you upload
one (`SplatViewer`/`SplatUploader`, space detail page → "3D Splat" card)
— but no provider, free or paid, hosts splat **training** as a simple
API call. Verified while scoping this: NVIDIA's catalog has nothing for
it, and the closest thing to a hosted option is "rent a GPU and run the
open-source training code yourself," which a free Colab/Kaggle notebook
already gives you for $0. That's the manual half of this workflow.

## What you need

- The photos for one space, already uploaded to a project in this app
  (the "Capture" tab).
- A free Google account (for Colab) or Kaggle account.
- ~15–45 minutes of free GPU time, depending on photo count and scene
  complexity.

## Steps

1. **Download your space's photos.** From the space's "Assets" or
   capture page, save the photos to a local folder — a real walkthrough
   with good overlap between shots (the same requirement COLMAP already
   needs for step B1's camera-pose estimation) gives noticeably better
   results than a handful of disconnected snapshots.

2. **Run structure-from-motion (COLMAP), then train the splat.** Open a
   free Colab notebook that chains COLMAP (camera pose recovery) into
   `gsplat` (the open-source Gaussian Splatting trainer) — for example
   one of the actively-maintained "3D Gaussian Splatting on Colab free
   tier" notebooks (searching that phrase surfaces current ones; verify
   the notebook still runs before trusting it blindly, the same
   "verify, don't assume" rule this whole project follows). Upload your
   photos into the notebook's input folder, select the free T4 GPU
   runtime, and run all cells.

3. **Download the trained `.ply` file.** Training produces a
   `point_cloud.ply` (or similarly named) file — this is the real,
   trained Gaussian Splat, typically a few MB to a few hundred MB
   depending on scene complexity.

4. **Upload it to this app.** Open the space's detail page, find the
   "3D Splat" card, click "Upload splat file", and select the `.ply`
   file (`.splat` and `.ksplat` — a trimmed/compressed variant — also
   work, see `@mkkellogg/gaussian-splats-3d`'s README if you want to
   convert for a smaller file). This creates a new reconstruction
   version (method `GAUSSIAN_SPLATTING`, provider `manual-upload`) and
   immediately becomes the space's current reconstruction, visible via
   the same versioning/restore machinery every other reconstruction
   method already uses.

## What "done" looks like

The "3D Splat" card renders your actual trained scene — pan and orbit
with the mouse — using `@mkkellogg/gaussian-splats-3d`, a maintained
open-source Three.js-based renderer (not a purpose-built viewer for
this project; reusing an existing renderer was the deliberate call
here, per `docs/rd-blueprint-classification.md`'s own reasoning for
this component).

## Known limits of this pass

- **Manual, not automated.** Uploading a real file is instant; training
  one is not something this app triggers itself, for the same reason
  B1's COLMAP job runs on a separate GitHub Actions workflow rather than
  inline: real training takes real GPU-minutes, which no free hosted API
  offers as a simple request/response call.
- **Not wired into the public experience viewer yet.** The splat
  renders on the authenticated space detail page; showing it on a
  published, publicly-shared experience is a real follow-on, not done
  in this pass.
- **No automatic COLMAP → gsplat handoff from B1.** B1's camera-pose
  workflow and this upload flow are both real, but they aren't chained
  together yet — B1 estimates poses for the camera-position viewer, this
  step trains and uploads a splat independently. Wiring B1's COLMAP
  output directly into a from-the-app-triggered training step would
  need real GPU compute this app can call synchronously, which doesn't
  exist for free (the same conclusion reached for B1 itself).
