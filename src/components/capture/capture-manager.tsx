"use client";

import { useRef, useState } from "react";
import { UploadCloud, Video, Play } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError, getCsrfToken } from "@/lib/api-client";
import { CSRF_HEADER } from "@/lib/cookies";
import { ProcessingStatus } from "./processing-status";
import type { AIJob } from "@/types";

interface SpaceRow {
  id: string;
  name: string;
  kind: string;
}

export function CaptureManager({ projectId, initialSpaces }: { projectId: string; initialSpaces: SpaceRow[] }) {
  const [spaces, setSpaces] = useState(initialSpaces);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>(initialSpaces[0]?.id ?? "");
  const [newSpaceName, setNewSpaceName] = useState("");
  const [uploadedCount, setUploadedCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function quickCreateSpace() {
    if (!newSpaceName.trim()) return;
    try {
      const { space } = await apiFetch<{ space: SpaceRow }>(`/api/projects/${projectId}/spaces`, {
        method: "POST",
        body: JSON.stringify({ name: newSpaceName, kind: "ROOM" }),
      });
      setSpaces((prev) => [...prev, space]);
      setSelectedSpaceId(space.id);
      setNewSpaceName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !selectedSpaceId) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("spaceId", selectedSpaceId);
        const csrfToken = getCsrfToken();
        const res = await fetch(`/api/projects/${projectId}/assets`, {
          method: "POST",
          body: form,
          headers: csrfToken ? { [CSRF_HEADER]: csrfToken } : undefined,
        });
        const body = await res.json();
        if (!res.ok) throw new ApiError(body?.error?.code, body?.error?.message ?? "Upload failed.", res.status);
        setUploadedCount((c) => c + 1);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function startProcessing() {
    if (!selectedSpaceId) return;
    setError(null);
    setProcessing(true);
    try {
      const { job } = await apiFetch<{ job: AIJob }>(
        `/api/projects/${projectId}/spaces/${selectedSpaceId}/process`,
        { method: "POST" }
      );
      setJobId(job.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start processing.");
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5">
          <h2 className="text-sm font-semibold">1. Choose a space</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {spaces.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSpaceId(s.id)}
                className={`focus-ring rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedSpaceId === s.id
                    ? "border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]"
                    : "border-[var(--line)] hover:bg-[var(--bg-muted)]"
                }`}
              >
                {s.name}
              </button>
            ))}
            <div className="flex items-center gap-2">
              <Input
                placeholder="New space name"
                value={newSpaceName}
                onChange={(e) => setNewSpaceName(e.target.value)}
                className="h-9 w-40"
              />
              <Button variant="secondary" size="sm" onClick={quickCreateSpace} disabled={!newSpaceName.trim()}>
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h2 className="text-sm font-semibold">2. Capture or import</h2>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Move slowly around the room. Keep your camera approximately at eye level, and capture
            every wall, corner and piece of furniture for the best reconstruction.
          </p>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void handleFiles(e.dataTransfer.files);
            }}
            className="mt-4 flex flex-col items-center justify-center rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--line)] px-6 py-12 text-center"
          >
            <UploadCloud className="mb-3 h-6 w-6 text-[var(--fg-muted)]" />
            <p className="text-sm text-[var(--fg-muted)]">Drag photos or a walkthrough video here</p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!selectedSpaceId || uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Video className="h-4 w-4" />
                Import media
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
            {uploadedCount > 0 && (
              <p className="mt-4 text-xs text-[var(--fg-muted)]">{uploadedCount} file(s) uploaded this session</p>
            )}
          </div>

          {error && <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">3. Process this space</h2>
              <p className="mt-1 text-sm text-[var(--fg-muted)]">
                Runs media validation, scene understanding and spatial reconstruction.
              </p>
            </div>
            <Button onClick={startProcessing} disabled={!selectedSpaceId || processing}>
              <Play className="h-4 w-4" />
              Analyze
            </Button>
          </div>

          {jobId && (
            <div className="mt-5 border-t border-[var(--line)] pt-5">
              <ProcessingStatus projectId={projectId} jobId={jobId} onDone={() => setProcessing(false)} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
