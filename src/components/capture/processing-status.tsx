"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { AIJob, JobStage } from "@/types";

const STAGE_LABELS: Record<JobStage, string> = {
  QUEUED: "Queued",
  MEDIA_VALIDATION: "Media validation",
  CAMERA_ANALYSIS: "Camera movement analysis",
  FRAME_EXTRACTION: "Frame extraction",
  SCENE_UNDERSTANDING: "Scene understanding",
  SPATIAL_RECONSTRUCTION: "Spatial reconstruction",
  QUALITY_OPTIMIZATION: "Quality optimization",
  EXPERIENCE_GENERATION: "Experience generation",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

const STAGE_ORDER: JobStage[] = [
  "MEDIA_VALIDATION",
  "CAMERA_ANALYSIS",
  "FRAME_EXTRACTION",
  "SCENE_UNDERSTANDING",
  "SPATIAL_RECONSTRUCTION",
  "QUALITY_OPTIMIZATION",
  "EXPERIENCE_GENERATION",
];

/**
 * Polls the real job status (§10) — never a fabricated progress bar. Each
 * row reflects the job's actual `stage`/`status` fields as persisted by
 * the pipeline in src/jobs/pipeline.ts.
 */
export function ProcessingStatus({
  projectId,
  jobId,
  onDone,
}: {
  projectId: string;
  jobId: string;
  onDone?: (job: AIJob) => void;
}) {
  const [job, setJob] = useState<AIJob | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const { jobs } = await apiFetch<{ jobs: AIJob[] }>(`/api/projects/${projectId}/jobs`);
        const current = jobs.find((j) => j.id === jobId) ?? null;
        if (cancelled) return;
        setJob(current);
        if (current && (current.status === "COMPLETED" || current.status === "FAILED")) {
          onDone?.(current);
          return;
        }
      } catch {
        // transient network error — keep polling
      }
      timer = setTimeout(poll, 1500);
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, jobId]);

  if (!job) return <p className="text-sm text-[var(--fg-muted)]">Starting…</p>;

  const currentIndex = STAGE_ORDER.indexOf(job.stage);

  return (
    <div>
      <ul className="space-y-2">
        {STAGE_ORDER.map((stage, i) => {
          const isCurrent = i === currentIndex && job.status === "PROCESSING";
          const done = job.status === "COMPLETED" || (job.status !== "FAILED" && i < currentIndex);
          return (
            <li key={stage} className="flex items-center gap-2 text-sm">
              {isCurrent ? (
                <Loader2 className="h-4 w-4 animate-spin text-[var(--color-accent)]" />
              ) : done ? (
                <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
              ) : (
                <Circle className="h-4 w-4 text-[var(--fg-muted)]" />
              )}
              <span>{STAGE_LABELS[stage]}</span>
            </li>
          );
        })}
      </ul>

      {job.status === "FAILED" && (
        <p className="mt-3 flex items-center gap-2 text-sm font-medium text-[var(--color-danger)]">
          <XCircle className="h-4 w-4" />
          Processing failed
        </p>
      )}
      {job.status === "FAILED" && job.error && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 p-3 text-sm">
          <p className="font-medium text-[var(--color-danger)]">{job.error.message}</p>
          {job.error.suggestedAction && (
            <p className="mt-1 text-[var(--fg-muted)]">{job.error.suggestedAction}</p>
          )}
        </div>
      )}
    </div>
  );
}
