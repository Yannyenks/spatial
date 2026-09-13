import Link from "next/link";
import { Building2, Eye, Layers, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentOrganization } from "@/lib/current-org";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";
import { PLAN_LIMITS } from "@/lib/quotas";
import type { PlanId } from "@/types";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const organization = await getCurrentOrganization(user!);
  if (!organization) return null;

  const projects = await db.project.findMany({
    where: { organizationId: organization.id },
    orderBy: { updatedAt: "desc" },
    include: { spaces: true, experience: true },
  });

  const spaceCount = projects.reduce((sum, p) => sum + p.spaces.length, 0);
  const publishedCount = projects.filter((p) => p.status === "PUBLISHED").length;

  const storageUsage = await db.asset.aggregate({
    where: { project: { organizationId: organization.id } },
    _sum: { sizeBytes: true },
  });
  const limits = PLAN_LIMITS[organization.plan as PlanId];

  const experienceIds = projects.map((p) => p.experience?.id).filter((id): id is string => Boolean(id));
  const visitCount = experienceIds.length
    ? await db.analyticsEvent.count({ where: { experienceId: { in: experienceIds }, name: "experience_opened" } })
    : 0;

  const stats = [
    { label: "Establishments", value: projects.length, icon: Building2 },
    { label: "Spaces captured", value: spaceCount, icon: Layers },
    { label: "Published experiences", value: publishedCount, icon: Sparkles },
    { label: "Total visits", value: visitCount, icon: Eye },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Storage used: {formatBytes(storageUsage._sum.sizeBytes ?? 0)} of {formatBytes(limits.maxStorageBytes)}
          </p>
        </div>
        <Link href="/projects/new">
          <Button>New project</Button>
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5">
              <s.icon className="mb-3 h-4 w-4 text-[var(--color-accent)]" />
              <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
              <p className="mt-1 text-xs text-[var(--fg-muted)]">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mt-10 mb-4 text-lg font-semibold">Your Spaces</h2>
      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-[var(--fg-muted)]">
              You haven&apos;t created a project yet.
            </p>
            <Link href="/projects/new" className="mt-4 inline-block">
              <Button>Create your first experience</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="h-full transition-shadow hover:shadow-[var(--shadow-lift)]">
                <div className="flex aspect-[4/3] items-center justify-center rounded-t-[var(--radius-lg)] bg-[var(--bg-muted)] text-[var(--fg-muted)]">
                  <Building2 className="h-8 w-8" />
                </div>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{p.name}</h3>
                    <Badge tone={p.status === "PUBLISHED" ? "success" : "neutral"}>{p.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-[var(--fg-muted)]">
                    {p.spaces.length} space{p.spaces.length === 1 ? "" : "s"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
