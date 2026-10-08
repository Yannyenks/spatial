"""RunPod Serverless handler: photos of a real space -> walkable 3D world,
via Tencent HY-World 2.0's WorldMirror 2.0 (world *reconstruction*: a
feed-forward model that predicts cameras, depth and 3D Gaussians for all
photos in one pass - no COLMAP, no per-scene training, which is exactly
where the nerfstudio worker failed on real input).

Same contract as docker/splat-worker/handler.py (photo_urls in, presigned
upload_url out, callback with an honest COMPLETED/FAILED), plus an optional
fly-through video rendered from the result.

Licensing: Tencent HY-World 2.0 Community License - not licensed for use in
the EU, UK or South Korea, and above 1M MAU a separate Tencent license is
needed. The app only routes jobs here for organizations allowed to use it.
"""
import os
import shutil
import tempfile
import time

import numpy as np
import requests
import runpod
from plyfile import PlyData

from hyworld2.worldrecon.pipeline import WorldMirrorPipeline

DOWNLOAD_TIMEOUT = 60
UPLOAD_TIMEOUT = 900
CALLBACK_TIMEOUT = 30
MODEL_DIR = os.environ.get("WORLDMIRROR_MODEL_DIR", "/models")
# A browser has to download and hold every splat: ~1.5M at 32 bytes each
# (~48MB) keeps a high-end look while still loading on a phone.
DEFAULT_MAX_SPLATS = 1_500_000
SH_C0 = 0.28209479177387814

# Loaded once per worker, not per job: the 5GB checkpoint takes far longer
# to load than a typical reconstruction takes to run.
PIPELINE = WorldMirrorPipeline.from_pretrained(MODEL_DIR, enable_bf16=True)


def report(callback_url, callback_secret, payload):
    try:
        requests.post(
            callback_url,
            json=payload,
            headers={"Authorization": f"Bearer {callback_secret}"},
            timeout=CALLBACK_TIMEOUT,
        )
    except requests.RequestException:
        # The job already succeeded or failed for a real reason; a network
        # blip on the callback isn't something a GPU worker can retry forever.
        pass


def ply_to_splat(ply_path, splat_path, max_splats):
    """Standard 3DGS PLY -> compact .splat (32 bytes/gaussian), most
    important gaussians first, capped at max_splats. Vectorized equivalent
    of hyworldmirror.utils.save_utils.process_ply_to_splat (same layout,
    same importance order), which loops per vertex in Python."""
    v = PlyData.read(ply_path)["vertex"].data
    log_scales = np.stack([v["scale_0"], v["scale_1"], v["scale_2"]], axis=1).astype(np.float32)
    opacity = 1.0 / (1.0 + np.exp(-v["opacity"].astype(np.float32)))
    importance = np.exp(log_scales.sum(axis=1)) * opacity
    order = np.argsort(-importance)[:max_splats]

    count = order.shape[0]
    out = np.zeros(count, dtype=[("pos", "<f4", 3), ("scale", "<f4", 3), ("rgba", "u1", 4), ("rot", "u1", 4)])
    out["pos"] = np.stack([v["x"], v["y"], v["z"]], axis=1)[order]
    out["scale"] = np.exp(log_scales[order])
    rgb = 0.5 + SH_C0 * np.stack([v["f_dc_0"], v["f_dc_1"], v["f_dc_2"]], axis=1)[order]
    rgba = np.concatenate([rgb, opacity[order, None]], axis=1)
    out["rgba"] = np.clip(rgba * 255, 0, 255).astype(np.uint8)
    rot = np.stack([v["rot_0"], v["rot_1"], v["rot_2"], v["rot_3"]], axis=1)[order].astype(np.float32)
    rot /= np.linalg.norm(rot, axis=1, keepdims=True) + 1e-12
    out["rot"] = np.clip(rot * 128 + 128, 0, 255).astype(np.uint8)
    out.tofile(splat_path)
    return count


def put_file(url, path, content_type):
    with open(path, "rb") as f:
        res = requests.put(url, data=f, headers={"Content-Type": content_type}, timeout=UPLOAD_TIMEOUT)
    res.raise_for_status()
    return os.path.getsize(path)


def handler(job):
    inp = job["input"]
    photo_urls = inp["photo_urls"]
    upload_url = inp["upload_url"]
    video_upload_url = inp.get("video_upload_url")
    callback_url = inp["callback_url"]
    callback_secret = inp["callback_secret"]
    max_splats = int(inp.get("max_splats", DEFAULT_MAX_SPLATS))
    target_size = int(inp.get("target_size", 952))

    workdir = tempfile.mkdtemp()
    started = time.time()
    try:
        images_dir = os.path.join(workdir, "images")
        os.makedirs(images_dir)
        for i, url in enumerate(photo_urls):
            r = requests.get(url, timeout=DOWNLOAD_TIMEOUT)
            r.raise_for_status()
            with open(os.path.join(images_dir, f"{i:04d}.jpg"), "wb") as f:
                f.write(r.content)

        out_dir = os.path.join(workdir, "out")
        PIPELINE(
            images_dir,
            strict_output_path=out_dir,
            target_size=target_size,
            save_depth=False,
            save_normal=False,
            save_points=False,
            save_camera=False,
            save_gs=True,
            save_rendered=bool(video_upload_url),
        )

        ply_path = os.path.join(out_dir, "gaussians.ply")
        if not os.path.exists(ply_path):
            raise RuntimeError("WorldMirror did not produce gaussians.ply.")
        splat_path = os.path.join(workdir, "scene.splat")
        splat_count = ply_to_splat(ply_path, splat_path, max_splats)
        size_bytes = put_file(upload_url, splat_path, "application/octet-stream")

        video_bytes = None
        video_path = os.path.join(out_dir, "rendered", "rendered_rgb.mp4")
        if video_upload_url and os.path.exists(video_path):
            video_bytes = put_file(video_upload_url, video_path, "video/mp4")

        result = {
            "status": "COMPLETED",
            "sizeBytes": size_bytes,
            "splatCount": splat_count,
            "videoBytes": video_bytes,
            "seconds": round(time.time() - started, 1),
        }
        report(callback_url, callback_secret, result)
        return result

    except Exception as e:  # noqa: BLE001 - a real, honest failure reason always beats a crashed worker with none
        error = f"{type(e).__name__}: {e}"
        report(callback_url, callback_secret, {"status": "FAILED", "error": error})
        return {"status": "FAILED", "error": error}

    finally:
        shutil.rmtree(workdir, ignore_errors=True)


runpod.serverless.start({"handler": handler})
