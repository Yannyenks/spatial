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

# The base image's runtime stage copies compiled site-packages from its
# builder stage but doesn't guarantee `pip` itself is left on PATH —
# ensure it explicitly rather than assume, since this layer only needs to
# add two pure-Python packages, not rebuild anything CUDA-related.
RUN python3 -m ensurepip --upgrade && python3 -m pip install --no-cache-dir runpod requests

COPY handler.py /workspace/handler.py

CMD ["python3", "-u", "/workspace/handler.py"]
