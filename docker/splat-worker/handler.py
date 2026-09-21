"""RunPod Serverless handler: real Gaussian Splat training from a space's
real photos (free-tier plan step B2, GPU path). Runs nerfstudio's own CLI
pipeline (COLMAP -> splatfacto -> export) exactly as documented — no
custom reconstruction code, since nerfstudio's implementation is the
maintained, correct one. Reports an honest FAILED result (with real
subprocess output) on any stage failure rather than pretending success.
"""
import glob
import os
import shutil
import subprocess
import tempfile

import requests
import runpod

DOWNLOAD_TIMEOUT = 60
UPLOAD_TIMEOUT = 600
CALLBACK_TIMEOUT = 30


def run_step(cmd, cwd=None):
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        tail = (result.stdout[-2000:] + "\n" + result.stderr[-2000:]).strip()
        raise RuntimeError(f"`{' '.join(cmd)}` failed (exit {result.returncode}):\n{tail}")


def report(callback_url, callback_secret, payload):
    try:
        requests.post(
            callback_url,
            json=payload,
            headers={"Authorization": f"Bearer {callback_secret}"},
            timeout=CALLBACK_TIMEOUT,
        )
    except requests.RequestException:
        # The job itself already succeeded or failed for a real reason by
        # the time we're reporting it; a network blip on the callback
        # itself isn't something a GPU worker can usefully retry forever.
        pass


def handler(job):
    inp = job["input"]
    photo_urls = inp["photo_urls"]
    upload_url = inp["upload_url"]
    callback_url = inp["callback_url"]
    callback_secret = inp["callback_secret"]
    max_iterations = int(inp.get("max_iterations", 7000))

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
            raise RuntimeError("ns-train did not produce a config.yml — no trained model to export.")

        export_dir = os.path.join(workdir, "export")
        run_step(["ns-export", "gaussian-splat", "--load-config", config_matches[0], "--output-dir", export_dir])

        splat_path = os.path.join(export_dir, "splat.ply")
        if not os.path.exists(splat_path):
            raise RuntimeError("ns-export did not produce splat.ply.")

        size_bytes = os.path.getsize(splat_path)
        with open(splat_path, "rb") as f:
            put_res = requests.put(
                upload_url,
                data=f,
                headers={"Content-Type": "application/octet-stream"},
                timeout=UPLOAD_TIMEOUT,
            )
        put_res.raise_for_status()

        report(callback_url, callback_secret, {"status": "COMPLETED", "sizeBytes": size_bytes})
        return {"status": "COMPLETED", "sizeBytes": size_bytes}

    except Exception as e:  # noqa: BLE001 - a real, honest failure reason always beats a crashed worker with none
        error = str(e)
        report(callback_url, callback_secret, {"status": "FAILED", "error": error})
        return {"status": "FAILED", "error": error}

    finally:
        shutil.rmtree(workdir, ignore_errors=True)


runpod.serverless.start({"handler": handler})
