"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { SpaceKind } from "@/types";

interface SpaceRow {
  id: string;
  name: string;
  kind: string;
  coverAssetId: string | null;
}
interface ConnectionRow {
  id: string;
  fromSpaceId: string;
  toSpaceId: string;
  label: string | null;
}

const KINDS: SpaceKind[] = [
  "LOBBY",
  "CORRIDOR",
  "ROOM",
  "SUITE",
  "BATHROOM",
  "RESTAURANT",
  "POOL",
  "GYM",
  "OFFICE",
  "OUTDOOR",
  "OTHER",
];

export function SpacesManager({
  projectId,
  initialSpaces,
  initialConnections,
}: {
  projectId: string;
  initialSpaces: SpaceRow[];
  initialConnections: ConnectionRow[];
}) {
  const [spaces, setSpaces] = useState(initialSpaces);
  const [connections, setConnections] = useState(initialConnections);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SpaceKind>("ROOM");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function addSpace(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { space } = await apiFetch<{ space: SpaceRow }>(`/api/projects/${projectId}/spaces`, {
        method: "POST",
        body: JSON.stringify({ name, kind }),
      });
      setSpaces((prev) => [...prev, space]);
      setName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function addConnection(e: React.FormEvent) {
    e.preventDefault();
    if (!fromId || !toId) return;
    setError(null);
    try {
      const { connection } = await apiFetch<{ connection: ConnectionRow }>(
        `/api/projects/${projectId}/spaces/connections`,
        { method: "POST", body: JSON.stringify({ fromSpaceId: fromId, toSpaceId: toId }) }
      );
      setConnections((prev) => [...prev, connection]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  function spaceName(id: string) {
    return spaces.find((s) => s.id === id)?.name ?? "Unknown";
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardContent className="pt-5">
          <h2 className="text-sm font-semibold">Add a space</h2>
          <form onSubmit={addSpace} className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <Label htmlFor="space-name">Name</Label>
              <Input
                id="space-name"
                placeholder="Room 204"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="space-kind">Kind</Label>
              <select
                id="space-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as SpaceKind)}
                className="focus-ring h-10 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--bg)] px-3 text-sm"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={!name.trim()} loading={loading}>
              <Plus className="h-4 w-4" />
              Add space
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Spaces ({spaces.length})</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {spaces.map((s) => (
            <Link key={s.id} href={`/projects/${projectId}/spaces/${s.id}`}>
              <Card className="transition-shadow hover:shadow-[var(--shadow-lift)]">
                <CardContent className="pt-5">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-[var(--fg-muted)]">{s.kind.replace(/_/g, " ")}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {spaces.length >= 2 && (
        <Card>
          <CardContent className="pt-5">
            <h2 className="text-sm font-semibold">Navigation graph</h2>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">
              Connect spaces so visitors can move between them (§14).
            </p>
            <form onSubmit={addConnection} className="mt-3 flex flex-wrap items-end gap-3">
              <select
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className="focus-ring h-10 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--bg)] px-3 text-sm"
              >
                <option value="">From…</option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ArrowRight className="h-4 w-4 text-[var(--fg-muted)]" />
              <select
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="focus-ring h-10 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--bg)] px-3 text-sm"
              >
                <option value="">To…</option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="secondary" disabled={!fromId || !toId}>
                Connect
              </Button>
            </form>

            <ul className="mt-4 space-y-1.5">
              {connections.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
                  <span className="text-[var(--fg)]">{spaceName(c.fromSpaceId)}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                  <span className="text-[var(--fg)]">{spaceName(c.toSpaceId)}</span>
                </li>
              ))}
              {connections.length === 0 && <li className="text-sm text-[var(--fg-muted)]">No connections yet.</li>}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
