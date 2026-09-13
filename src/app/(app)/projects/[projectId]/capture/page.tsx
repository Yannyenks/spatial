import { getCurrentUser } from "@/lib/auth";
import { listSpaces } from "@/services/space.service";
import { CaptureManager } from "@/components/capture/capture-manager";

export default async function CapturePage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  const { projectId } = await params;
  const spaces = await listSpaces(user!.id, projectId);

  return <CaptureManager projectId={projectId} initialSpaces={spaces} />;
}
