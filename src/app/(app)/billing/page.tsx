import { getCurrentUser } from "@/lib/auth";
import { getCurrentOrganization } from "@/lib/current-org";
import { db } from "@/lib/db";
import { PLAN_LIMITS } from "@/lib/quotas";
import { getUsageSummary } from "@/services/usage.service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBytes } from "@/lib/utils";
import type { PlanId } from "@/types";

const PLAN_ORDER: PlanId[] = ["STARTER", "PRO", "BUSINESS", "ENTERPRISE"];

export default async function BillingPage() {
  const user = await getCurrentUser();
  const organization = await getCurrentOrganization(user!);
  if (!organization) return null;

  const [projectCount, storageUsage, usage] = await Promise.all([
    db.project.count({ where: { organizationId: organization.id } }),
    db.asset.aggregate({ where: { project: { organizationId: organization.id } }, _sum: { sizeBytes: true } }),
    getUsageSummary(organization.id, 30),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Plan quotas are enforced server-side (§30) — this page only reflects real usage.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Current usage</h2>
            <Badge tone="accent">{organization.plan} plan</Badge>
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--fg-muted)]">Projects</dt>
              <dd>
                {projectCount} /{" "}
                {Number.isFinite(PLAN_LIMITS[organization.plan as PlanId].maxProjects)
                  ? PLAN_LIMITS[organization.plan as PlanId].maxProjects
                  : "Unlimited"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--fg-muted)]">Storage</dt>
              <dd>
                {formatBytes(storageUsage._sum.sizeBytes ?? 0)} / {formatBytes(PLAN_LIMITS[organization.plan as PlanId].maxStorageBytes)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h2 className="text-sm font-semibold">Usage — last 30 days</h2>
          <p className="mt-1 text-xs text-[var(--fg-muted)]">
            Real metered events (execution-plan §63/§64), not estimates.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "AI jobs run", value: usage.ai_jobs ?? 0 },
              { label: "Processing time", value: `${Math.round((usage.processed_seconds ?? 0) / 60)} min` },
              { label: "Videos generated", value: usage.video_generations ?? 0 },
              { label: "Experience views", value: usage.experience_views ?? 0 },
            ].map((row) => (
              <div key={row.label}>
                <dt className="text-xs text-[var(--fg-muted)]">{row.label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((plan) => {
          const limits = PLAN_LIMITS[plan];
          const isCurrent = organization.plan === plan;
          return (
            <Card key={plan} className={isCurrent ? "border-[var(--fg)]" : undefined}>
              <CardContent className="pt-5">
                <h3 className="text-sm font-semibold">{plan}</h3>
                <ul className="mt-3 space-y-1 text-xs text-[var(--fg-muted)]">
                  <li>{Number.isFinite(limits.maxProjects) ? limits.maxProjects : "Unlimited"} project(s)</li>
                  <li>{formatBytes(limits.maxStorageBytes)} storage</li>
                  <li>{Number.isFinite(limits.maxAiJobsPerMonth) ? limits.maxAiJobsPerMonth : "Unlimited"} AI jobs/mo</li>
                  <li>{limits.customDomain ? "Custom domain" : "Platform domain only"}</li>
                  <li>{limits.whiteLabel ? "White-label" : "Spatial branding"}</li>
                </ul>
                {isCurrent && (
                  <Badge tone="accent" className="mt-3">
                    Current plan
                  </Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
