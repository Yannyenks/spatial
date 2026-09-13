"use client";

import { useState } from "react";
import { Film } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { VideoGenerationFormat, VideoGenerationStyle, VideoGenerationJob } from "@/types";

const FORMATS: VideoGenerationFormat[] = ["16:9", "9:16", "1:1"];
const STYLES: VideoGenerationStyle[] = ["LUXURY", "CINEMATIC", "EDITORIAL", "NATURAL"];

export function VideoStudio({ projectId }: { projectId: string }) {
  const [duration, setDuration] = useState(15);
  const [format, setFormat] = useState<VideoGenerationFormat>("16:9");
  const [style, setStyle] = useState<VideoGenerationStyle>("LUXURY");
  const [job, setJob] = useState<VideoGenerationJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    setLoading(true);
    try {
      const { job: createdJob } = await apiFetch<{ job: VideoGenerationJob }>(`/api/projects/${projectId}/ai/video`, {
        method: "POST",
        body: JSON.stringify({ spaceIds: [], durationSeconds: duration, format, style }),
      });
      setJob(createdJob);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Film className="h-4 w-4 text-[var(--color-accent)]" />
          AI Studio — Cinematic video
        </h2>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Generation is conditioned on this project&apos;s own spaces (§19) — this preview uses the
          mock provider until a real video model is connected.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-medium">Duration</p>
            <input
              type="range"
              min={5}
              max={60}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-[var(--fg-muted)]">{duration}s</p>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium">Format</p>
            <div className="flex gap-2">
              {FORMATS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={cn(
                    "focus-ring rounded-[var(--radius-md)] border px-3 py-1.5 text-xs font-medium",
                    format === f ? "border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]" : "border-[var(--line)]"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium">Style</p>
            <div className="flex flex-wrap gap-2">
              {STYLES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  className={cn(
                    "focus-ring rounded-[var(--radius-md)] border px-3 py-1.5 text-xs font-medium",
                    style === s ? "border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]" : "border-[var(--line)]"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

          <Button onClick={generate} loading={loading} className="w-full">
            Generate
          </Button>

          {job && (
            <p className="text-sm text-[var(--fg-muted)]">
              Job {job.id.slice(0, 12)}… queued with the {job.provider} provider. Status polling isn&apos;t
              wired into this preview yet — check back via the API once a real provider is connected.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
