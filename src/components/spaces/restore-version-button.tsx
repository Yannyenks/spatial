"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api-client";

export function RestoreVersionButton({ projectId, reconstructionId }: { projectId: string; reconstructionId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/projects/${projectId}/reconstructions/${reconstructionId}/restore`, { method: "POST" });
      // Hard reload, not router.refresh() — see login/page.tsx for why: the
      // same silent-no-update failure reproduces here too, verified live —
      // the restore call itself succeeds (200, DB updated correctly) but
      // router.refresh() never re-renders the server component with the
      // new data, leaving the "Current" badge stuck on the old version
      // until a manual reload.
      window.location.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not restore this version.");
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" loading={loading} onClick={restore}>
        Restore
      </Button>
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
    </div>
  );
}
