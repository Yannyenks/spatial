"use client";

import { useState } from "react";
import { Plus, Trash2, Webhook } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiFetch, ApiError } from "@/lib/api-client";

const AVAILABLE_EVENTS = [
  "reconstruction.completed",
  "experience.published",
  "video.generated",
  "ai.job.completed",
  "capture.quality_failed",
] as const;

interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
}

/** Enterprise webhook management (execution-plan §58). */
export function WebhookManager({ organizationId, initialWebhooks }: { organizationId: string; initialWebhooks: WebhookRow[] }) {
  const [webhooks, setWebhooks] = useState(initialWebhooks);
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleEvent(event: string) {
    setSelectedEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));
  }

  async function addWebhook(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || selectedEvents.length === 0) return;
    setError(null);
    setLoading(true);
    try {
      const { endpoint } = await apiFetch<{ endpoint: WebhookRow & { secret: string } }>(
        `/api/organizations/${organizationId}/webhooks`,
        { method: "POST", body: JSON.stringify({ url, events: selectedEvents }) }
      );
      setWebhooks((prev) => [...prev, endpoint]);
      setNewSecret(endpoint.secret);
      setUrl("");
      setSelectedEvents([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function removeWebhook(id: string) {
    setError(null);
    try {
      await apiFetch(`/api/organizations/${organizationId}/webhooks/${id}`, { method: "DELETE" });
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete webhook.");
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Webhook className="h-4 w-4" />
          Webhooks
        </h2>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Notify your own systems when real events happen — reconstruction completed, an experience
          published, capture quality failed. Payloads are HMAC-signed.
        </p>

        <form onSubmit={addWebhook} className="mt-4 space-y-3">
          <div>
            <Label htmlFor="webhook-url">Endpoint URL</Label>
            <Input
              id="webhook-url"
              type="url"
              placeholder="https://your-system.example.com/webhooks/spatial"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div>
            <Label>Events</Label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_EVENTS.map((event) => (
                <button
                  key={event}
                  type="button"
                  onClick={() => toggleEvent(event)}
                  className={`focus-ring rounded-full border px-3 py-1.5 text-xs font-mono transition-colors ${
                    selectedEvents.includes(event)
                      ? "border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]"
                      : "border-[var(--line)] hover:bg-[var(--bg-muted)]"
                  }`}
                >
                  {event}
                </button>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={!url.trim() || selectedEvents.length === 0} loading={loading}>
            <Plus className="h-4 w-4" />
            Add webhook
          </Button>
        </form>

        {error && <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>}

        {newSecret && (
          <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] p-3 text-sm">
            <p className="font-medium">Signing secret (shown once)</p>
            <code className="mt-1 block break-all font-mono text-xs">{newSecret}</code>
          </div>
        )}

        <ul className="mt-4 space-y-2">
          {webhooks.map((w) => (
            <li key={w.id} className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--bg-muted)] p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-mono text-xs">{w.url}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {w.events.map((event) => (
                    <Badge key={event}>{event}</Badge>
                  ))}
                </div>
              </div>
              <button onClick={() => removeWebhook(w.id)} className="focus-ring shrink-0 text-[var(--fg-muted)] hover:text-[var(--color-danger)]">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {webhooks.length === 0 && <li className="text-sm text-[var(--fg-muted)]">No webhooks configured yet.</li>}
        </ul>
      </CardContent>
    </Card>
  );
}
