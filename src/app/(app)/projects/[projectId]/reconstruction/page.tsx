import { getCurrentUser } from "@/lib/auth";
import { listReconstructionsByProject } from "@/services/reconstruction.service";
import { Card, CardContent } from "@/components/ui/card";
import { RestoreVersionButton } from "@/components/spaces/restore-version-button";
import type { QualityScore } from "@/types";

export default async function ReconstructionPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  const { projectId } = await params;
  const groups = await listReconstructionsByProject(user!.id, projectId);

  return (
    <div className="space-y-6">
      {groups.map(({ space, versions }) => (
        <Card key={space.id}>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{space.name}</h2>
              <span className="text-xs text-[var(--fg-muted)]">{versions.length} version(s)</span>
            </div>

            {versions.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--fg-muted)]">Not processed yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {versions.map((v) => {
                  const quality: QualityScore | null = v.qualityJson ? JSON.parse(v.qualityJson) : null;
                  return (
                    <li key={v.id} className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--bg-muted)] px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium">Version {v.version}</span>
                        <span className="ml-2 text-[var(--fg-muted)]">{v.method}</span>
                        {quality && <span className="ml-2 text-[var(--fg-muted)]">· {quality.overall}% quality</span>}
                        {v.isCurrent && <span className="ml-2 font-medium text-[var(--color-accent)]">Current</span>}
                      </div>
                      {!v.isCurrent && (
                        <RestoreVersionButton projectId={projectId} reconstructionId={v.id} />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
