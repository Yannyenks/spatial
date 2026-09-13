"use client";

import { useState } from "react";
import { Plus, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { HotspotType } from "@/types";

interface HotspotRow {
  id: string;
  type: string;
  title: string;
  description: string | null;
}

const TYPES: HotspotType[] = ["INFORMATION", "IMAGE", "VIDEO", "ROOM", "BOOKING", "EXTERNAL_LINK", "AI"];

export function HotspotManager({
  projectId,
  spaceId,
  initialHotspots,
}: {
  projectId: string;
  spaceId: string;
  initialHotspots: HotspotRow[];
}) {
  const [hotspots, setHotspots] = useState(initialHotspots);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<HotspotType>("INFORMATION");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function addHotspot(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { hotspot } = await apiFetch<{ hotspot: HotspotRow }>(
        `/api/projects/${projectId}/spaces/${spaceId}/hotspots`,
        {
          method: "POST",
          body: JSON.stringify({ type, title, description: description || undefined, position: { x: 0, y: 0, z: 0 } }),
        }
      );
      setHotspots((prev) => [...prev, hotspot]);
      setTitle("");
      setDescription("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <h2 className="text-sm font-semibold">Hotspots</h2>
        <form onSubmit={addHotspot} className="mt-3 flex flex-wrap items-end gap-3">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as HotspotType)}
            className="focus-ring h-10 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--bg)] px-3 text-sm"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <div className="min-w-[160px]">
            <Label htmlFor="hotspot-title">Title</Label>
            <Input id="hotspot-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ocean View" />
          </div>
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="hotspot-desc">Description</Label>
            <Input
              id="hotspot-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="King bed, private balcony"
            />
          </div>
          <Button type="submit" disabled={!title.trim()} loading={loading}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </form>
        {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}

        <ul className="mt-4 space-y-2">
          {hotspots.map((h) => (
            <li key={h.id} className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--bg-muted)] p-3 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" />
              <div>
                <p className="font-medium">{h.title}</p>
                {h.description && <p className="text-[var(--fg-muted)]">{h.description}</p>}
              </div>
            </li>
          ))}
          {hotspots.length === 0 && <li className="text-sm text-[var(--fg-muted)]">No hotspots yet.</li>}
        </ul>
      </CardContent>
    </Card>
  );
}
