import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });

  return (
    <div className="max-w-xl space-y-6">
      <Card>
        <CardContent className="pt-5">
          <h2 className="text-sm font-semibold">Project details</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--fg-muted)]">Name</dt>
              <dd>{project.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--fg-muted)]">Type</dt>
              <dd>{project.type.replace(/_/g, " ")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--fg-muted)]">Status</dt>
              <dd>{project.status}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--fg-muted)]">Created</dt>
              <dd>{project.createdAt.toLocaleDateString()}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h2 className="text-sm font-semibold">White-label branding</h2>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Custom domain, logo and platform-branding removal are configured from the Publish panel
            and are available on Business and Enterprise plans (§25, §30).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
