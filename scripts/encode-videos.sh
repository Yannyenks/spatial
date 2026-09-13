#!/bin/sh
# Encodes the 5 source clips per the video-integration master prompt §2-3:
#   - Scrub videos (perception-overlay, reconstruction-morph): all-intra
#     (-g 1 -keyint_min 1 -sc_threshold 0) so currentTime seeks are instant.
#   - Ambient loop videos (lobby-dolly, semantic-graph,
#     one-twin-many-experiences): standard GOP, they are never seeked.
#   - Every video: stripped of audio (-an — none of these should ever
#     depend on sound), yuv420p, +faststart, 480p + 1080p tiers.
#     A 2160p tier is skipped for all five: the sources are native 1080p,
#     so a 3840x2160 "tier" would be an upscale with no real added
#     resolution — shipping it would be dead weight, not quality (§3
#     itself marks 2160 "optional").
#   - Posters: first frame, JPG + WebP, from the 1080p encode.
#
# Run from the project root: sh scripts/encode-videos.sh
set -e

FFMPEG="${FFMPEG:-ffmpeg}"
SRC_DIR="source-videos"
OUT_VIDEO_DIR="public/videos"
OUT_POSTER_DIR="public/posters"
mkdir -p "$OUT_VIDEO_DIR" "$OUT_POSTER_DIR"

# name : scrub(1/0)
NAMES="perception-overlay:1 reconstruction-morph:1 lobby-dolly:0 semantic-graph:0 one-twin-many-experiences:0"

for entry in $NAMES; do
  name="${entry%%:*}"
  scrub="${entry##*:}"
  src="$SRC_DIR/$name.source.mp4"
  if [ ! -f "$src" ]; then
    echo "MISSING: $src" >&2
    exit 1
  fi

  echo "== $name (scrub=$scrub) =="

  if [ "$scrub" = "1" ]; then
    GOP_ARGS="-g 1 -keyint_min 1 -sc_threshold 0"
    # All-intra inflates file size heavily (every frame is a full I-frame);
    # CRF 18 blew a 10s 1080p clip out to ~12-30MB, well over the §4
    # desktop budget (<8MB for the Hero's first-screen weight). CRF 23
    # measured at ~6.9MB for the same clip — comfortably under budget —
    # while still visually clean (23 is a normal "high quality" H.264
    # value; the softness all-intra avoids is what actually matters for
    # scrub cleanliness, not a couple of CRF steps).
    CRF_1080=23
  else
    GOP_ARGS=""
    CRF_1080=18
  fi

  # 1080p tier
  "$FFMPEG" -y -i "$src" \
    -vf "scale=1920:-2" \
    -c:v libx264 -preset slow -crf $CRF_1080 \
    $GOP_ARGS \
    -pix_fmt yuv420p -movflags +faststart \
    -an \
    "$OUT_VIDEO_DIR/$name-1080.mp4"

  # 480p tier (mobile / slow connection)
  "$FFMPEG" -y -i "$src" \
    -vf "scale=854:-2" \
    -c:v libx264 -preset slow -crf 20 \
    $GOP_ARGS \
    -pix_fmt yuv420p -movflags +faststart \
    -an \
    "$OUT_VIDEO_DIR/$name-480.mp4"

  # Poster: first frame, from the 1080p encode, JPG + WebP.
  "$FFMPEG" -y -i "$OUT_VIDEO_DIR/$name-1080.mp4" -frames:v 1 -q:v 3 \
    "$OUT_POSTER_DIR/$name.jpg"
  "$FFMPEG" -y -i "$OUT_VIDEO_DIR/$name-1080.mp4" -frames:v 1 -c:v libwebp -q:v 80 \
    "$OUT_POSTER_DIR/$name.webp"

  echo
done

echo "Done. Sizes:"
ls -la "$OUT_VIDEO_DIR"
ls -la "$OUT_POSTER_DIR"
