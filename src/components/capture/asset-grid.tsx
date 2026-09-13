"use client";

import { useState } from "react";
import { Trash2, Video as VideoIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatBytes } from "@/lib/utils";
import { apiFetch, ApiError } from "@/lib/api-client";

interface AssetRow {
  id: string;
  kind: string;
  spaceId: string | null;
  sizeBytes: number;
  url: string;
  thumbnailUrl: string | null;
}
interface SpaceRow {
  id: string;
  name: string;
}

export function AssetGrid({
  projectId,
  initialAssets,
  spaces,
}: {
  projectId: string;
  initialAssets: AssetRow[];
  spaces: SpaceRow[];
}) {
  const [assets, setAssets] = useState(initialAssets);
  const [error, setError] = useState<string | null>(null);

  function spaceName(id: string | null) {
    return spaces.find((s) => s.id === id)?.name ?? "Unassigned";
  }

  async function remove(assetId: string) {
    setError(null);
    try {
      await apiFetch(`/api/projects/${projectId}/assets/${assetId}`, { method: "DELETE" });
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete asset.");
    }
  }

  if (assets.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-[var(--fg-muted)]">
          No media uploaded yet. Head to the Capture tab to get started.
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      {error && <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {assets.map((a) => (
          <Card key={a.id} className="overflow-hidden">
            <div className="flex aspect-square items-center justify-center bg-[var(--bg-muted)]">
              {a.kind === "PHOTO" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.thumbnailUrl ?? a.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <VideoIcon className="h-6 w-6 text-[var(--fg-muted)]" />
              )}
            </div>
            <CardContent className="flex items-center justify-between pt-3 pb-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{spaceName(a.spaceId)}</p>
                <p className="text-xs text-[var(--fg-muted)]">{formatBytes(a.sizeBytes)}</p>
              </div>
              <button onClick={() => remove(a.id)} className="focus-ring text-[var(--fg-muted)] hover:text-[var(--color-danger)]">
                <Trash2 className="h-4 w-4" />
              </button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
