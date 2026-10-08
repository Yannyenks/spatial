# RunPod Serverless worker: Tencent HY-World 2.0 WorldMirror 2.0
# (photos -> 3D Gaussian world). See handler.py.
#
# Two stages so the shipped image stays a runtime image: gsplat's CUDA
# kernels are compiled ahead of time in the devel image (CI runners have
# nvcc but no GPU, which is all compilation needs), then only the wheel is
# copied over. FlashAttention is deliberately not installed: WorldMirror
# falls back to PyTorch's own scaled_dot_product_attention without it, and
# building it from source costs hours of CI for a modest speedup.

ARG TORCH_IMAGE=pytorch/pytorch:2.7.1-cuda12.8-cudnn9

FROM ${TORCH_IMAGE}-devel AS gsplat-builder
# Ampere (A4000-A6000, A40, A100), Ada (L4, L40S, 4090) and Hopper (H100):
# every GPU type a RunPod endpoint for this worker is expected to use.
ENV TORCH_CUDA_ARCH_LIST="8.0;8.6;8.9;9.0" MAX_JOBS=4
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
RUN pip wheel --no-build-isolation --no-deps -w /wheels "git+https://github.com/nerfstudio-project/gsplat.git@v1.5.3"

FROM ${TORCH_IMAGE}-runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=gsplat-builder /wheels /wheels
RUN pip install --no-cache-dir /wheels/*.whl \
    && pip install --no-cache-dir \
        numpy==1.26.4 scipy==1.14.1 opencv-python-headless==4.10.0.84 matplotlib==3.10.3 \
        pillow pillow_heif einops safetensors huggingface_hub omegaconf \
        trimesh plyfile pycolmap==3.10.0 onnxruntime tqdm requests runpod \
    && rm -rf /wheels

# Pinned to a known commit, and only the reconstruction package: the world
# *generation* half of HY-World 2.0 (80B/17B models) isn't used here.
ARG HY_WORLD_COMMIT=df9988efb87bfc0f4947eb3889411cf957478b06
WORKDIR /workspace
RUN curl -fsSL "https://codeload.github.com/Tencent-Hunyuan/HY-World-2.0/tar.gz/${HY_WORLD_COMMIT}" \
        | tar -xz --strip-components=1 "HY-World-2.0-${HY_WORLD_COMMIT}/hyworld2/__init__.py" "HY-World-2.0-${HY_WORLD_COMMIT}/hyworld2/worldrecon" "HY-World-2.0-${HY_WORLD_COMMIT}/License.txt"

# Weights baked in (~5GB) so a cold start never waits on a Hugging Face
# download; skyseg.onnx is looked up relative to the working directory.
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download('tencent/HY-World-2.0', allow_patterns=['HY-WorldMirror-2.0/*'], local_dir='/models')" \
    && curl -fsSL -o /workspace/skyseg.onnx "https://huggingface.co/JianyuanWang/skyseg/resolve/main/skyseg.onnx"

COPY handler.py /workspace/handler.py
ENV PYTHONPATH=/workspace WORLDMIRROR_MODEL_DIR=/models
CMD ["python", "-u", "/workspace/handler.py"]
