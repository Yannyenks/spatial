import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getProjectOverview } from "@/services/project.service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function ProjectOverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  const { projectId } = await params;
  const { spaces, assetCount, jobCount, experience } = await getProjectOverview(user!.id, projectId);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-semibold tabular-nums">{spaces.length}</p>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">Spaces</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-semibold tabular-nums">{assetCount}</p>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">Media assets</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-semibold tabular-nums">{jobCount}</p>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">Processing jobs</p>
          </CardContent>
        </Card>
      </div>

      {experience?.publishedAt && (
        <Card>
          <CardContent className="flex items-center justify-between pt-5">
            <div>
              <p className="text-sm font-medium">Published experience</p>
              <p className="text-sm text-[var(--fg-muted)]">/experience/{experience.slug}</p>
            </div>
            <Link href={`/experience/${experience.slug}`} target="_blank">
              <Button variant="secondary">View live</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Spaces</h2>
          <Link href={`/projects/${projectId}/spaces`}>
            <Button variant="secondary" size="sm">
              Manage spaces
            </Button>
          </Link>
        </div>

        {spaces.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-sm text-[var(--fg-muted)]">No spaces yet. Start by capturing your first room.</p>
              <Link href={`/projects/${projectId}/capture`} className="mt-4 inline-block">
                <Button>Go to Capture</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {spaces.map((s) => (
              <Link key={s.id} href={`/projects/${projectId}/spaces/${s.id}`}>
                <Card className="transition-shadow hover:shadow-[var(--shadow-lift)]">
                  <CardContent className="flex items-center justify-between pt-5">
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-[var(--fg-muted)]">{s.kind.replace(/_/g, " ")}</p>
                    </div>
                    <Badge>{s.coverAssetId ? "Captured" : "Empty"}</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
