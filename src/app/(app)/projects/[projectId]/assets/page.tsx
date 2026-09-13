import { getCurrentUser } from "@/lib/auth";
import { listAssets } from "@/services/asset.service";
import { listSpaces } from "@/services/space.service";
import { AssetGrid } from "@/components/capture/asset-grid";

export default async function AssetsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  const { projectId } = await params;
  const [assets, spaces] = await Promise.all([listAssets(user!.id, projectId), listSpaces(user!.id, projectId)]);

  return <AssetGrid projectId={projectId} initialAssets={assets} spaces={spaces} />;
}
