"use client";

import { useState } from "react";
import Link from "next/link";
import { Rocket, Copy, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { ExperienceVisibility } from "@/types";

interface ExperienceState {
  name: string;
  slug: string;
  visibility: string;
  publishedAt: string | null;
}

export function PublishPanel({
  projectId,
  defaultName,
  experience,
  isReady,
}: {
  projectId: string;
  defaultName: string;
  experience: ExperienceState | null;
  isReady: boolean;
}) {
  const [name, setName] = useState(experience?.name ?? defaultName);
  const [visibility, setVisibility] = useState<ExperienceVisibility>(
    (experience?.visibility as ExperienceVisibility) ?? "PUBLIC"
  );
  const [password, setPassword] = useState("");
  const [current, setCurrent] = useState(experience);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const publicUrl = current ? `${typeof window !== "undefined" ? window.location.origin : ""}/experience/${current.slug}` : null;

  async function publish() {
    setError(null);
    setLoading(true);
    try {
      const { experience: exp } = await apiFetch<{ experience: ExperienceState }>(
        `/api/projects/${projectId}/publish`,
        {
          method: "POST",
          body: JSON.stringify({
            name,
            visibility,
            password: visibility === "PASSWORD_PROTECTED" ? password : undefined,
          }),
        }
      );
      setCurrent(exp);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function copyLink() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="max-w-xl space-y-6">
      {!isReady && (
        <Card>
          <CardContent className="pt-5 text-sm text-[var(--fg-muted)]">
            Add at least one space and process it before publishing.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-5">
          <h2 className="text-sm font-semibold">Publish Experience</h2>

          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="exp-name">Experience name</Label>
              <Input id="exp-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div>
              <Label>Visibility</Label>
              <div className="flex gap-2">
                {(["PUBLIC", "PRIVATE", "PASSWORD_PROTECTED"] as ExperienceVisibility[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setVisibility(v)}
                    className={`focus-ring rounded-[var(--radius-md)] border px-3 py-1.5 text-xs font-medium transition-colors ${
                      visibility === v
                        ? "border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]"
                        : "border-[var(--line)] hover:bg-[var(--bg-muted)]"
                    }`}
                  >
                    {v.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>

            {visibility === "PASSWORD_PROTECTED" && (
              <div>
                <Label htmlFor="exp-password">Password</Label>
                <Input id="exp-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}

            {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

            <Button onClick={publish} disabled={!isReady || !name.trim()} loading={loading} className="w-full">
              <Rocket className="h-4 w-4" />
              {current?.publishedAt ? "Republish" : "Publish"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {current?.publishedAt && publicUrl && (
        <Card>
          <CardContent className="flex items-center justify-between pt-5">
            <div className="min-w-0">
              <p className="text-sm font-medium">Live</p>
              <p className="truncate text-sm text-[var(--fg-muted)]">{publicUrl}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" size="sm" onClick={copyLink}>
                <Copy className="h-4 w-4" />
                {copied ? "Copied" : "Copy"}
              </Button>
              <Link href={`/experience/${current.slug}`} target="_blank">
                <Button variant="secondary" size="sm">
                  <ExternalLink className="h-4 w-4" />
                  Open
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
