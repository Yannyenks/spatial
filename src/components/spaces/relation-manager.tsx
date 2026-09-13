"use client";

import { useState } from "react";
import { Link2, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { SpatialRelation } from "@/types";

/**
 * Editor for the Semantic World Model (§12 platform spec; §17/§20 R&D
 * blueprint): lets an owner assert real facts about a space — "has a
 * balcony", "overlooks the pool" — that the Spatial Query Engine and AI
 * concierge then answer questions from. Every relation created here is
 * stored with provenance REAL (a human is asserting it), separate from
 * whatever a future reconstruction pipeline might INFER on its own.
 */
export function RelationManager({
  projectId,
  spaceId,
  initialRelations,
}: {
  projectId: string;
  spaceId: string;
  initialRelations: SpatialRelation[];
}) {
  const [relations, setRelations] = useState(initialRelations);
  const [predicate, setPredicate] = useState("has");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function addRelation(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const { relation } = await apiFetch<{ relation: SpatialRelation }>(`/api/projects/${projectId}/relations`, {
        method: "POST",
        body: JSON.stringify({
          subjectType: "SPACE",
          subjectId: spaceId,
          predicate,
          objectType: "CONCEPT",
          objectLabel: label,
        }),
      });
      setRelations((prev) => [...prev, relation]);
      setLabel("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <h2 className="text-sm font-semibold">Semantic facts</h2>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Facts the Spatial Query Engine and AI concierge can answer from — e.g. &quot;has a
          balcony&quot;. Never guessed by the AI without your input.
        </p>

        <form onSubmit={addRelation} className="mt-3 flex flex-wrap items-end gap-3">
          <select
            value={predicate}
            onChange={(e) => setPredicate(e.target.value)}
            className="focus-ring h-10 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--bg)] px-3 text-sm"
          >
            <option value="has">has</option>
            <option value="overlooks">overlooks</option>
            <option value="near">near</option>
          </select>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="balcony"
            className="max-w-[200px]"
          />
          <Button type="submit" disabled={!label.trim()} loading={loading}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </form>
        {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}

        <ul className="mt-4 space-y-2">
          {relations.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <Link2 className="h-4 w-4 text-[var(--color-accent)]" />
              <span>
                {r.predicate} {r.objectLabel ?? r.objectId}
              </span>
              <Badge tone={r.provenance === "REAL" ? "success" : "neutral"}>{r.provenance}</Badge>
            </li>
          ))}
          {relations.length === 0 && <li className="text-sm text-[var(--fg-muted)]">No facts recorded yet.</li>}
        </ul>
      </CardContent>
    </Card>
  );
}
