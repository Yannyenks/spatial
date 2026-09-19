"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api-client";

interface CameraPoseJob {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  error: string | null;
}

/**
 * Triggers the real, free structure-from-motion run (free-tier plan step
 * B1 — docs/free-tier-roadmap.md, .github/workflows/estimate-camera-pose.yml).
 * Genuinely slow (COLMAP on a free CPU-only GitHub Actions runner, several
 * minutes) — polled, not awaited synchronously, and labeled as such rather
 * than implying this is as fast as the mock/depth-only "Analyze" step.
 */
export function CameraPoseTrigger({ projectId, spaceId }: { projectId: string; spaceId: string }) {
  const [job, setJob] = useState<CameraPoseJob | null>(null);
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
        const { job: latest } = await apiFetch<{ job: CameraPoseJob }>(
          `/api/projects/${projectId}/camera-pose-jobs/${jobId}`
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
      const { job: created } = await apiFetch<{ job: CameraPoseJob }>(
        `/api/projects/${projectId}/spaces/${spaceId}/camera-pose`,
        { method: "POST" }
      );
      setJob(created);
      pollJob(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start camera-pose estimation.");
    } finally {
      setStarting(false);
    }
  }

  const running = job?.status === "QUEUED" || job?.status === "RUNNING";

  return (
    <div className="mt-3 border-t border-[var(--line)] pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--fg-muted)]">
          Beta: runs real structure-from-motion (COLMAP) on a free CI runner — takes several minutes, not instant.
        </p>
        <Button variant="secondary" size="sm" onClick={start} disabled={starting || running}>
          {running ? "Estimating…" : "Estimate real camera pose"}
        </Button>
      </div>
      {job?.status === "FAILED" && (
        <p className="mt-2 text-sm text-[var(--color-danger)]">{job.error ?? "Camera-pose estimation failed."}</p>
      )}
      {job?.status === "COMPLETED" && (
        <p className="mt-2 text-sm text-[var(--color-accent)]">Real camera poses applied — refresh to see them above.</p>
      )}
      {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
