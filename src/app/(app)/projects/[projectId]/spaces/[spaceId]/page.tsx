import { getCurrentUser } from "@/lib/auth";
import { getSpaceDetail } from "@/services/space.service";
import { getRelationsForSpace } from "@/services/spatial-query.service";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { HotspotManager } from "@/components/spaces/hotspot-manager";
import { RelationManager } from "@/components/spaces/relation-manager";
import { CameraPoseViewer } from "@/components/spaces/camera-pose-viewer";
import { CameraPoseTrigger } from "@/components/spaces/camera-pose-trigger";
import { SplatViewer } from "@/components/spaces/splat-viewer";
import { SplatUploader } from "@/components/spaces/splat-uploader";
import { SplatTrainingTrigger } from "@/components/spaces/splat-training-trigger";
import type { QualityScore } from "@/types";

// CameraPoseViewer and SplatViewer both defer their actual heavy
// dependency (Three.js, @mkkellogg/gaussian-splats-3d) to a dynamic
// import() inside their own useEffect rather than a static top-level
// import — see the comment in camera-pose-viewer.tsx for why: a plain
// next/dynamic() wrapper here did NOT stop those chunks from loading on
// every space-detail visit (verified live, no change in load time), so
// the fix has to live inside each component's own module, not at this
// call site.

export default async function SpaceDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; spaceId: string }>;
}) {
  const user = await getCurrentUser();
  const { projectId, spaceId } = await params;
  const { space, assets, scene, reconstruction, hotspots, connectionsFrom, connectionsTo, jobs } = await getSpaceDetail(
    user!.id,
    projectId,
    spaceId
  );
  const [relations, parentSpace] = await Promise.all([
    getRelationsForSpace(projectId, spaceId),
    space.parentSpaceId ? db.space.findUnique({ where: { id: space.parentSpaceId } }) : null,
  ]);

  const quality: QualityScore | null = reconstruction?.qualityJson ? JSON.parse(reconstruction.qualityJson) : null;
  const sceneMetadata: { cameraPoseSource?: string } = scene?.metadataJson ? JSON.parse(scene.metadataJson) : {};
  const cameraPoseSource = sceneMetadata.cameraPoseSource === "colmap" ? "real" : "placeholder";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          {parentSpace && (
            <p className="text-xs text-[var(--fg-muted)]">{parentSpace.name} /</p>
          )}
          <h1 className="text-xl font-semibold">{space.name}</h1>
          <p className="text-sm text-[var(--fg-muted)]">{space.kind.replace(/_/g, " ")}</p>
        </div>
        <Badge tone={reconstruction ? "success" : "neutral"}>
          {reconstruction
            ? `Reconstructed · v${reconstruction.version}${reconstruction.provider ? ` · ${reconstruction.provider}` : ""}`
            : "Not processed yet"}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-5">
            <h2 className="text-sm font-semibold">Media ({assets.length})</h2>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {assets.slice(0, 8).map((a) =>
                a.kind === "PHOTO" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={a.id}
                    src={a.thumbnailKey ? `/api/uploads/thumbnails/${a.thumbnailKey}` : `/api/uploads/${a.bucket}/${a.storageKey}`}
                    alt=""
                    className="aspect-square rounded-[var(--radius-md)] object-cover"
                  />
                ) : (
                  <div key={a.id} className="flex aspect-square items-center justify-center rounded-[var(--radius-md)] bg-[var(--bg-muted)] text-xs text-[var(--fg-muted)]">
                    Video
                  </div>
                )
              )}
            </div>
            {assets.length === 0 && <p className="mt-2 text-sm text-[var(--fg-muted)]">No media captured yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <h2 className="text-sm font-semibold">Navigation</h2>
            <div className="mt-3 space-y-1 text-sm">
              {connectionsFrom.map((c) => (
                <p key={c.id} className="text-[var(--fg-muted)]">
                  → {c.toSpace.name}
                </p>
              ))}
              {connectionsTo.map((c) => (
                <p key={c.id} className="text-[var(--fg-muted)]">
                  ← {c.fromSpace.name}
                </p>
              ))}
              {connectionsFrom.length === 0 && connectionsTo.length === 0 && (
                <p className="text-[var(--fg-muted)]">Not connected to any other space yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {reconstruction?.method === "GAUSSIAN_SPLATTING" && reconstruction.outputUri && (
        <Card>
          <CardContent className="pt-5">
            <h2 className="text-sm font-semibold">3D Splat</h2>
            <div className="mt-3">
              <SplatViewer url={reconstruction.outputUri} />
            </div>
            <SplatUploader projectId={projectId} spaceId={spaceId} />
            <SplatTrainingTrigger projectId={projectId} spaceId={spaceId} />
          </CardContent>
        </Card>
      )}
      {reconstruction?.method !== "GAUSSIAN_SPLATTING" && (
        <Card>
          <CardContent className="pt-5">
            <h2 className="text-sm font-semibold">3D Splat</h2>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">
              No real 3D splat for this space yet — train one on a rented GPU below, or upload one trained elsewhere.
            </p>
            <SplatUploader projectId={projectId} spaceId={spaceId} />
            <SplatTrainingTrigger projectId={projectId} spaceId={spaceId} />
          </CardContent>
        </Card>
      )}

      {scene && scene.cameraPoses.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h2 className="text-sm font-semibold">Camera positions</h2>
            <div className="mt-3">
              <CameraPoseViewer poses={scene.cameraPoses} source={cameraPoseSource} />
            </div>
            <CameraPoseTrigger projectId={projectId} spaceId={spaceId} />
          </CardContent>
        </Card>
      )}

      {quality && (
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Experience Quality</h2>
              <span className="text-2xl font-semibold tabular-nums">{quality.overall}%</span>
            </div>
            <div className="mt-4 space-y-3">
              {[
                { label: "Geometry", value: quality.geometry },
                { label: "Coverage", value: quality.coverage },
                { label: "Visual Quality", value: quality.visualQuality },
                { label: "Navigation", value: quality.navigation },
              ].map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex justify-between text-xs text-[var(--fg-muted)]">
                    <span>{row.label}</span>
                    <span>{row.value}%</span>
                  </div>
                  <Progress value={row.value} />
                </div>
              ))}
            </div>
            {quality.recommendations.length > 0 && (
              <ul className="mt-4 space-y-1 border-t border-[var(--line)] pt-4 text-sm text-[var(--fg-muted)]">
                {quality.recommendations.map((r) => (
                  <li key={r}>⚠ {r}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <RelationManager projectId={projectId} spaceId={spaceId} initialRelations={relations} />

      <HotspotManager projectId={projectId} spaceId={spaceId} initialHotspots={hotspots} />

      {jobs.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h2 className="text-sm font-semibold">Recent processing jobs</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {jobs.map((j) => (
                <li key={j.id} className="flex items-center justify-between">
                  <span className="text-[var(--fg-muted)]">{new Date(j.createdAt).toLocaleString()}</span>
                  <Badge tone={j.status === "COMPLETED" ? "success" : j.status === "FAILED" ? "danger" : "neutral"}>
                    {j.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
