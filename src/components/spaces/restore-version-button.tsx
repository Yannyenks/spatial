"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

export function RestoreVersionButton({ projectId, reconstructionId }: { projectId: string; reconstructionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function restore() {
    setLoading(true);
    try {
      await apiFetch(`/api/projects/${projectId}/reconstructions/${reconstructionId}/restore`, { method: "POST" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" loading={loading} onClick={restore}>
      Restore
    </Button>
  );
}
