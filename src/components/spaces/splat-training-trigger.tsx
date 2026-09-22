"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api-client";

interface SplatTrainingJob {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  error: string | null;
}

/**
 * Triggers a real Gaussian Splat training run on a rented GPU (free-tier
 * plan step B2, GPU path — Modal running nerfstudio). Genuinely
 * slow (COLMAP + splatfacto training, several minutes) and genuinely costs
 * real money per run (a few cents to under a dollar on a consumer GPU) —
 * polled, not awaited synchronously, and labeled honestly rather than
 * implying this is free like the manual-upload path next to it.
 */
export function SplatTrainingTrigger({ projectId, spaceId }: { projectId: string; spaceId: string }) {
  const [job, setJob] = useState<SplatTrainingJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function pollJob(jobId: string) {
    pollRef.current = setInterval(async () => {
      try {
        const { job: latest } = await apiFetch<{ job: SplatTrainingJob }>(
          `/api/projects/${projectId}/splat-training-jobs/${jobId}`
        );
        setJob(latest);
        if (latest.status === "COMPLETED" || latest.status === "FAILED") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 5000);
  }

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const { job: created } = await apiFetch<{ job: SplatTrainingJob }>(
        `/api/projects/${projectId}/spaces/${spaceId}/splat-training`,
        { method: "POST" }
      );
      setJob(created);
      pollJob(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start splat training.");
    } finally {
      setStarting(false);
    }
  }

  const running = job?.status === "QUEUED" || job?.status === "RUNNING";

  return (
    <div className="mt-3 border-t border-[var(--line)] pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--fg-muted)]">
          Beta: trains a real 3D splat on a rented GPU (Modal) — takes several minutes and costs real money per run.
        </p>
        <Button variant="secondary" size="sm" onClick={start} disabled={starting || running}>
          {running ? "Training…" : "Train real 3D splat"}
        </Button>
      </div>
      {job?.status === "FAILED" && (
        <p className="mt-2 text-sm text-[var(--color-danger)]">{job.error ?? "Splat training failed."}</p>
      )}
      {job?.status === "COMPLETED" && (
        <p className="mt-2 text-sm text-[var(--color-accent)]">Real trained splat applied — refresh to see it above.</p>
      )}
      {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
