"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api-client";
import { MAX_WORLD_INSTRUCTION_LENGTH } from "@/lib/world-prompt";
import type { SplatEngineOption } from "@/services/splat-training.service";

interface SplatTrainingJob {
  id: string;
  status: "QUEUED" | "RUNNING" | "FINALIZING" | "COMPLETED" | "FAILED";
  error: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  QUEUED: "Starting…",
  RUNNING: "Generating the world…",
  FINALIZING: "Saving the world…",
};

/**
 * Builds a walkable 3D world from the space's photos with one of the
 * engines configured on this deployment (World Labs Marble, Tencent HY
 * WorldMirror, or the legacy nerfstudio pipeline). Every engine takes
 * minutes and costs real money per run, so the cost is shown before the
 * click and the job is polled rather than awaited. The page refreshes on
 * completion so the new world appears without a manual reload.
 *
 * With World Labs, an optional instruction ("Scandinavian decor, warm
 * evening light") generates a restyled version of the same space instead
 * of a faithful one; earlier versions stay restorable.
 */
export function SplatTrainingTrigger({
  projectId,
  spaceId,
  engines,
}: {
  projectId: string;
  spaceId: string;
  engines: SplatEngineOption[];
}) {
  const router = useRouter();
  const [engine, setEngine] = useState(engines[0]?.engine);
  const [instruction, setInstruction] = useState("");
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
          if (latest.status === "COMPLETED") router.refresh();
        }
      } catch {
        // A missed poll (network blip, slow finalization) isn't fatal;
        // the next tick tries again.
      }
    }, 10000);
  }

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const { job: created } = await apiFetch<{ job: SplatTrainingJob }>(
        `/api/projects/${projectId}/spaces/${spaceId}/splat-training`,
        {
          method: "POST",
          body: JSON.stringify({ engine, instruction: selected.engine === "marble" ? instruction.trim() || undefined : undefined }),
        }
      );
      setJob(created);
      pollJob(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start 3D world generation.");
    } finally {
      setStarting(false);
    }
  }

  if (engines.length === 0) {
    return (
      <p className="mt-3 border-t border-[var(--line)] pt-3 text-xs text-[var(--fg-muted)]">
        No 3D world engine is configured on this deployment (set WORLDLABS_API_KEY to enable World Labs Marble).
      </p>
    );
  }

  const running = job !== null && job.status in STATUS_LABEL;
  const selected = engines.find((e) => e.engine === engine) ?? engines[0]!;
  const restyling = selected.engine === "marble" && instruction.trim().length > 0;

  return (
    <div className="mt-3 border-t border-[var(--line)] pt-3">
      {engines.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {engines.map((option) => (
            <button
              key={option.engine}
              onClick={() => setEngine(option.engine)}
              disabled={running}
              className={`focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                option.engine === selected.engine
                  ? "border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]"
                  : "border-[var(--line)] hover:bg-[var(--bg-muted)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      {selected.engine === "marble" && (
        <div className="mb-2">
          <Label htmlFor={`world-instruction-${spaceId}`} className="text-xs">
            Change the space with AI (optional)
          </Label>
          <Textarea
            id={`world-instruction-${spaceId}`}
            rows={2}
            maxLength={MAX_WORLD_INSTRUCTION_LENGTH}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={running}
            placeholder="e.g. Scandinavian decor, light oak floor, warm evening light"
          />
          <p className="mt-1 text-xs text-[var(--fg-muted)]">
            {restyling
              ? "Creates a restyled version that keeps the room's layout. The current world stays in the version history."
              : "Leave empty for a faithful copy of the room as photographed."}
          </p>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-xs text-[var(--fg-muted)]">
          {engines.length === 1 && <span className="font-medium text-[var(--fg)]">{selected.label} · </span>}
          {selected.note}
        </p>
        <Button size="sm" onClick={start} disabled={starting || running} className="self-start sm:self-auto">
          <Sparkles className="h-4 w-4" />
          {running ? STATUS_LABEL[job!.status] : restyling ? "Generate restyled world" : "Generate 3D world"}
        </Button>
      </div>
      {job?.status === "FAILED" && (
        <p className="mt-2 text-sm text-[var(--color-danger)]">{job.error ?? "3D world generation failed."}</p>
      )}
      {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
