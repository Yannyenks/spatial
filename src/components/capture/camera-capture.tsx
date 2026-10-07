"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, X } from "lucide-react";

// In-app guided capture: a full-screen live camera that uploads each
// shot as it's taken and coaches the photographer in real time. Splat
// training lives or dies on capture quality (sharp frames, ~70% overlap
// between consecutive shots), and a bad set is only discovered after a
// paid GPU run - so the checks run here, at the moment a retake is free.
//
// The thresholds below are on-device heuristics, not ground truth: they
// catch the obvious failures (a blurred frame, shooting the same view
// twice, jumping so far there's nothing in common) and stay out of the
// way otherwise. A frame the user insists on can always be kept.

const MAX_LONG_SIDE = 1920; // plenty for COLMAP + splatfacto, keeps uploads well under the request size limit
const JPEG_QUALITY = 0.9;
const SHARPNESS_SAMPLE_WIDTH = 320;
const MIN_SHARPNESS = 40; // Laplacian variance at 320px; below this a frame is almost always motion-blurred
const DIFF_SAMPLE = { w: 32, h: 24 };
const MIN_CHANGE = 4; // mean abs gray difference: below this the camera barely moved
const MAX_CHANGE = 55; // above this consecutive shots likely share too little to match

type Feedback = { tone: "ok" | "warn" | "bad"; text: string };

function grayscale(video: HTMLVideoElement, width: number, height: number, canvas: HTMLCanvasElement) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
  return gray;
}

// Variance of the Laplacian: the standard cheap focus/blur measure.
function sharpness(gray: Float32Array, width: number, height: number) {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = gray[i - width]! + gray[i + width]! + gray[i - 1]! + gray[i + 1]! - 4 * gray[i]!;
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function meanAbsDiff(a: Float32Array, b: Float32Array) {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += Math.abs(a[i]! - b[i]!);
  return total / a.length;
}

export function CameraCapture({
  count,
  target,
  pendingUploads,
  onCapture,
  onClose,
}: {
  count: number;
  target: number;
  pendingUploads: number;
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const workCanvas = useRef<HTMLCanvasElement | null>(null);
  const previousThumb = useRef<Float32Array | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({
    tone: "ok",
    text: "Stand at the room's edge. Take a photo, side-step, repeat - all the way around.",
  });
  const [rejected, setRejected] = useState<{ file: File; thumb: Float32Array } | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let wakeLock: { release: () => Promise<void> } | null = null;
    let cancelled = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("This browser can't open the camera here.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setReady(true);
      } catch {
        setCameraError("Camera access was blocked. Allow it in your browser settings, or use your phone's camera app.");
        return;
      }
      try {
        // Keep the screen awake through a capture session of a few minutes.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wakeLock = await (navigator as any).wakeLock?.request("screen");
      } catch {
        // Optional nicety; capture works without it.
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      wakeLock?.release().catch(() => {});
    };
  }, []);

  const keep = useCallback(
    (file: File, thumb: Float32Array, note?: Feedback) => {
      previousThumb.current = thumb;
      setRejected(null);
      onCapture(file);
      setFeedback(note ?? { tone: "ok", text: "Good shot. Side-step and take the next one." });
    },
    [onCapture]
  );

  async function shoot() {
    const video = videoRef.current;
    if (!video || !ready || !video.videoWidth) return;
    workCanvas.current ??= document.createElement("canvas");
    const canvas = workCanvas.current;

    const scale = Math.min(1, MAX_LONG_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) return;
    const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });

    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    navigator.vibrate?.(30);

    const sampleHeight = Math.round((SHARPNESS_SAMPLE_WIDTH * height) / width);
    const sharp = sharpness(grayscale(video, SHARPNESS_SAMPLE_WIDTH, sampleHeight, canvas), SHARPNESS_SAMPLE_WIDTH, sampleHeight);
    const thumb = grayscale(video, DIFF_SAMPLE.w, DIFF_SAMPLE.h, canvas);

    if (sharp < MIN_SHARPNESS) {
      setRejected({ file, thumb });
      setFeedback({ tone: "bad", text: "Blurry - hold the phone still for a beat, then shoot again." });
      return;
    }
    if (previousThumb.current) {
      const change = meanAbsDiff(thumb, previousThumb.current);
      if (change < MIN_CHANGE) {
        setRejected({ file, thumb });
        setFeedback({ tone: "warn", text: "Almost the same as the last photo - take a step to the side first." });
        return;
      }
      if (change > MAX_CHANGE) {
        keep(file, thumb, {
          tone: "warn",
          text: "Big jump from the last photo. Smaller steps keep enough overlap - go back halfway if you can.",
        });
        return;
      }
    }
    keep(file, thumb);
  }

  const done = count >= target;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      {cameraError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <Camera className="h-8 w-8 text-white/60" />
          <p className="text-sm text-white/80">{cameraError}</p>
          <button
            onClick={() => fallbackInputRef.current?.click()}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black"
          >
            Use phone camera
          </button>
          <input
            ref={fallbackInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onCapture(file);
              e.target.value = "";
            }}
          />
          <p className="text-xs text-white/50">{count} photos so far</p>
        </div>
      ) : (
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
      )}

      {flash && <div className="pointer-events-none absolute inset-0 bg-white/70" />}

      <div className="relative flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button onClick={onClose} aria-label="Close camera" className="rounded-full bg-black/40 p-2.5 backdrop-blur">
          <X className="h-5 w-5" />
        </button>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums">
            {count} <span className="text-white/60">/ {target}</span>
          </p>
          <p className="flex items-center justify-end gap-1 text-xs text-white/70">
            {pendingUploads > 0 ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> uploading {pendingUploads}
              </>
            ) : (
              count > 0 && (
                <>
                  <Check className="h-3 w-3" /> all uploaded
                </>
              )
            )}
          </p>
        </div>
      </div>

      <div className="relative mt-auto bg-gradient-to-t from-black/80 to-transparent px-4 pt-10 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-3 h-1 max-w-xs overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-all"
            style={{ width: `${Math.min(100, (count / target) * 100)}%` }}
          />
        </div>
        <p
          className={`mx-auto max-w-sm text-center text-sm ${
            feedback.tone === "bad" ? "text-red-300" : feedback.tone === "warn" ? "text-amber-200" : "text-white/85"
          }`}
        >
          {done && feedback.tone === "ok"
            ? "Great coverage. Keep going for corners you missed, or tap Done."
            : feedback.text}
        </p>
        {rejected && (
          <div className="mt-2 text-center">
            <button
              onClick={() => keep(rejected.file, rejected.thumb)}
              className="text-xs text-white/70 underline underline-offset-2"
            >
              Keep it anyway
            </button>
          </div>
        )}

        {!cameraError && (
          <div className="mt-5 grid grid-cols-3 items-center">
            <span />
            <button
              onClick={shoot}
              disabled={!ready}
              aria-label="Take photo"
              className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white/90 disabled:opacity-40"
            >
              <span className="h-14 w-14 rounded-full bg-white transition-transform active:scale-90" />
            </button>
            <button
              onClick={onClose}
              className="justify-self-end rounded-full bg-white/15 px-4 py-2 text-sm font-medium backdrop-blur"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
