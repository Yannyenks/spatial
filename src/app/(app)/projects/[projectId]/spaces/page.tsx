import { getCurrentUser } from "@/lib/auth";
import { listSpaces } from "@/services/space.service";
import { db } from "@/lib/db";
import { SpacesManager } from "@/components/spaces/spaces-manager";

export default async function SpacesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  const { projectId } = await params;
  const spaces = await listSpaces(user!.id, projectId);
  const connections = await db.spaceConnection.findMany({
    where: { fromSpace: { projectId } },
  });

  return <SpacesManager projectId={projectId} initialSpaces={spaces} initialConnections={connections} />;
}
