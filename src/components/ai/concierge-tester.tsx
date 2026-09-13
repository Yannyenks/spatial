"use client";

import { useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { AgentTurn } from "@/types";

export function ConciergeTester({ projectId }: { projectId: string }) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const turn = await apiFetch<AgentTurn>(`/api/projects/${projectId}/ai/concierge`, {
        method: "POST",
        body: JSON.stringify({ question }),
      });
      setTurns((prev) => [...prev, turn]);
      setQuestion("");
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
          <Sparkles className="h-4 w-4 text-[var(--color-accent)]" />
          AI Concierge preview
        </h2>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Test how the concierge answers using your project&apos;s own spaces (§16-§17). It never
          invents rooms that don&apos;t exist.
        </p>

        <div className="mt-4 max-h-64 space-y-3 overflow-y-auto">
          {turns.map((t, i) => (
            <div key={i} className="text-sm">
              <p className="font-medium">{t.question}</p>
              {t.actions.map((a, j) => (
                <p key={j} className="mt-1 text-[var(--fg-muted)]">
                  {a.action === "answer" && a.text}
                  {a.action === "navigate" && `→ navigate to space ${a.targetSpaceId}`}
                  {a.action === "no_action" && a.reason}
                </p>
              ))}
            </div>
          ))}
          {turns.length === 0 && <p className="text-sm text-[var(--fg-muted)]">Ask something like “Where is the pool?”</p>}
        </div>

        {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}

        <form onSubmit={ask} className="mt-4 flex gap-2">
          <Input
            placeholder="What would you like to explore?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Button type="submit" loading={loading} disabled={!question.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
