import { ConciergeTester } from "@/components/ai/concierge-tester";
import { VideoStudio } from "@/components/ai/video-studio";

export default async function AIPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ConciergeTester projectId={projectId} />
      <VideoStudio projectId={projectId} />
    </div>
  );
}
