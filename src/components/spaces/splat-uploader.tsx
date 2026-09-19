"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ApiError, getCsrfToken } from "@/lib/api-client";
import { CSRF_HEADER } from "@/lib/cookies";

/**
 * Uploads an already-trained Gaussian Splat file (free-tier plan step B2
 * — docs/free-tier-roadmap.md). No hosted free training API exists, so
 * this is the manual half of the workflow: train it yourself on a free
 * Colab/Kaggle GPU notebook (docs/gaussian-splatting-guide.md), then
 * bring the result here.
 */
export function SplatUploader({ projectId, spaceId }: { projectId: string; spaceId: string }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const csrfToken = getCsrfToken();
      const res = await fetch(`/api/projects/${projectId}/spaces/${spaceId}/splat`, {
        method: "POST",
        body: form,
        headers: csrfToken ? { [CSRF_HEADER]: csrfToken } : undefined,
      });
      const body = await res.json();
      if (!res.ok) throw new ApiError(body?.error?.code, body?.error?.message ?? "Upload failed.", res.status);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload this file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="mt-3 border-t border-[var(--line)] pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--fg-muted)]">
          Beta: upload a real Gaussian Splat file (.ply/.splat/.ksplat) trained outside the app — see the guide for a free way to make one.
        </p>
        <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading…" : "Upload splat file"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ply,.splat,.ksplat"
          className="hidden"
          onChange={(e) => handleFile(e.target.files)}
        />
      </div>
      {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
