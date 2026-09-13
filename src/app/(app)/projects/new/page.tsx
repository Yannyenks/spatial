"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { ProjectType } from "@/types";

const TYPES: { value: ProjectType; label: string }[] = [
  { value: "HOTEL", label: "Hotel" },
  { value: "VILLA", label: "Villa" },
  { value: "APARTMENT", label: "Apartment" },
  { value: "REAL_ESTATE", label: "Real Estate" },
  { value: "RESTAURANT", label: "Restaurant" },
  { value: "OFFICE", label: "Office" },
  { value: "HEALTHCARE", label: "Healthcare" },
  { value: "RETAIL", label: "Retail" },
  { value: "OTHER", label: "Other" },
];

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [type, setType] = useState<ProjectType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function createProject() {
    if (!type) return;
    setLoading(true);
    setError(null);
    try {
      const { project } = await apiFetch<{ project: { id: string } }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name, type }),
      });
      router.push(`/projects/${project.id}/capture`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-8 flex items-center gap-2 text-xs font-medium text-[var(--fg-muted)]">
        <span className={cn(step === 1 && "text-[var(--fg)]")}>1. Name</span>
        <span>—</span>
        <span className={cn(step === 2 && "text-[var(--fg)]")}>2. Type</span>
      </div>

      <Card>
        <CardContent className="pt-6">
          {step === 1 && (
            <div>
              <h1 className="text-xl font-semibold">Name your project</h1>
              <p className="mt-1 text-sm text-[var(--fg-muted)]">
                This is the establishment your guests will explore.
              </p>
              <div className="mt-6">
                <Label htmlFor="name">Project name</Label>
                <Input
                  id="name"
                  autoFocus
                  placeholder="Hotel Riviera"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <Button className="mt-8 w-full" disabled={!name.trim()} onClick={() => setStep(2)}>
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {step === 2 && (
            <div>
              <h1 className="text-xl font-semibold">What kind of space is this?</h1>
              <p className="mt-1 text-sm text-[var(--fg-muted)]">
                This helps us tailor capture guidance and hotspot types.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setType(t.value)}
                    className={cn(
                      "focus-ring rounded-[var(--radius-md)] border px-3 py-3 text-sm font-medium transition-colors",
                      type === t.value
                        ? "border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]"
                        : "border-[var(--line)] hover:bg-[var(--bg-muted)]"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {error && <p className="mt-4 text-sm text-[var(--color-danger)]">{error}</p>}

              <div className="mt-8 flex gap-2">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button className="flex-1" disabled={!type} loading={loading} onClick={createProject}>
                  Create project
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
