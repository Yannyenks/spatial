# RunPod Serverless worker for real Gaussian Splat training (free-tier
# plan step B2, GPU path). Built on nerfstudio's own official image
# (ghcr.io/nerfstudio-project/nerfstudio) rather than assembling
# COLMAP/CUDA/gsplat ourselves — that stack is exactly what the countless
# dependency-hell reports for hand-built gaussian-splatting containers
# warn against, and this base image is the actively maintained upstream
# artifact (verified against its real Dockerfile before relying on it: it
# already bundles COLMAP + CUDA + nerfstudio's CLI). Pinned to a real,
# verified tag rather than "latest" for reproducible builds.
FROM ghcr.io/nerfstudio-project/nerfstudio:1.1.5

WORKDIR /workspace

# The base image only apt-installs bare `python3.10` (no pip) — confirmed
# live: `python3 -m ensurepip` fails with "No module named ensurepip",
# since Ubuntu splits that into the separate python3-venv package rather
# than bundling it with python3.10 itself. Installing pip via apt instead
# of ensurepip avoids relying on a module the base image never included.
RUN apt-get update && apt-get install -y --no-install-recommends python3-pip && rm -rf /var/lib/apt/lists/* \
    && python3 -m pip install --no-cache-dir runpod requests

COPY handler.py /workspace/handler.py

CMD ["python3", "-u", "/workspace/handler.py"]
