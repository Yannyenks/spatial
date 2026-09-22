"""Modal app for real Gaussian Splat training (free-tier plan step B2, GPU
path) - replaces the RunPod Serverless integration after RunPod's account
never let a single worker reach RUNNING across every GPU type/region tried
(missing-template and oversubscribed-GPU bugs were found and fixed there,
but a further, account-level restriction remained beyond what config
changes could resolve).

Points directly at nerfstudio's own official image
(ghcr.io/nerfstudio-project/nerfstudio) rather than our own custom
docker/splat-worker/ image - Modal runs the Python function bodies below
as the actual entrypoint itself (no separate CMD/handler.py needed the
way RunPod's raw-container model required), so there's nothing left for
our own Docker image to add. One fewer moving part: no Dockerfile, no
GHCR, no GitHub Actions build step to keep in sync.

Deploy with: modal deploy modal_worker/splat_worker.py
"""
import glob
import os
import shutil
import subprocess
import tempfile

import modal

image = modal.Image.from_registry("ghcr.io/nerfstudio-project/nerfstudio:1.1.5", add_python="3.10").pip_install("requests")

app = modal.App("spatial-splat-worker")

DOWNLOAD_TIMEOUT = 60
UPLOAD_TIMEOUT = 600
CALLBACK_TIMEOUT = 30


def run_step(cmd, cwd=None):
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        tail = (result.stdout[-2000:] + "\n" + result.stderr[-2000:]).strip()
        raise RuntimeError(f"`{' '.join(cmd)}` failed (exit {result.returncode}):\n{tail}")


def report(callback_url, callback_secret, payload):
    import requests

    try:
        requests.post(
            callback_url,
            json=payload,
            headers={"Authorization": f"Bearer {callback_secret}"},
            timeout=CALLBACK_TIMEOUT,
        )
    except requests.RequestException:
        pass


@app.function(image=image, gpu="A10G", timeout=1800)
def train_splat(
    job_id: str,
    photo_urls: list[str],
    upload_url: str,
    callback_url: str,
    callback_secret: str,
    max_iterations: int = 7000,
):
    import requests

    workdir = tempfile.mkdtemp()
    try:
        images_dir = os.path.join(workdir, "images")
        os.makedirs(images_dir, exist_ok=True)
        for i, url in enumerate(photo_urls):
            r = requests.get(url, timeout=DOWNLOAD_TIMEOUT)
            r.raise_for_status()
            with open(os.path.join(images_dir, f"{i:04d}.jpg"), "wb") as f:
                f.write(r.content)

        processed_dir = os.path.join(workdir, "processed")
        run_step(["ns-process-data", "images", "--data", images_dir, "--output-dir", processed_dir])

        outputs_dir = os.path.join(workdir, "outputs")
        run_step(
            [
                "ns-train",
                "splatfacto",
                "--data",
                processed_dir,
                "--output-dir",
                outputs_dir,
                "--viewer.quit-on-train-completion",
                "True",
                "--vis",
                "viewer",
                "--max-num-iterations",
                str(max_iterations),
            ]
        )

        config_matches = glob.glob(os.path.join(outputs_dir, "**", "config.yml"), recursive=True)
        if not config_matches:
            raise RuntimeError("ns-train did not produce a config.yml - no trained model to export.")

        export_dir = os.path.join(workdir, "export")
        run_step(["ns-export", "gaussian-splat", "--load-config", config_matches[0], "--output-dir", export_dir])

        splat_path = os.path.join(export_dir, "splat.ply")
        if not os.path.exists(splat_path):
            raise RuntimeError("ns-export did not produce splat.ply.")

        size_bytes = os.path.getsize(splat_path)
        with open(splat_path, "rb") as f:
            put_res = requests.put(upload_url, data=f, headers={"Content-Type": "application/octet-stream"}, timeout=UPLOAD_TIMEOUT)
        put_res.raise_for_status()

        report(callback_url, callback_secret, {"status": "COMPLETED", "sizeBytes": size_bytes})
        return {"status": "COMPLETED", "sizeBytes": size_bytes}

    except Exception as e:  # noqa: BLE001 - an honest failure reason always beats a crashed job with none
        error = str(e)
        report(callback_url, callback_secret, {"status": "FAILED", "error": error})
        return {"status": "FAILED", "error": error}

    finally:
        shutil.rmtree(workdir, ignore_errors=True)


web_image = modal.Image.debian_slim().pip_install("fastapi[standard]")


@app.function(image=web_image, secrets=[modal.Secret.from_name("splat-training-secret")])
@modal.fastapi_endpoint(method="POST")
def trigger(payload: dict):
    from fastapi import HTTPException

    expected_secret = os.environ.get("SPLAT_TRAINING_SECRET")
    if not expected_secret or payload.get("secret") != expected_secret:
        raise HTTPException(status_code=401, detail="Invalid or missing splat-training secret.")

    call = train_splat.spawn(
        job_id=payload["job_id"],
        photo_urls=payload["photo_urls"],
        upload_url=payload["upload_url"],
        callback_url=payload["callback_url"],
        callback_secret=payload["callback_secret"],
        max_iterations=payload.get("max_iterations", 7000),
    )
    return {"status": "queued", "callId": call.object_id}
