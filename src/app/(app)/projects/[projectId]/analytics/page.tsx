import { getCurrentUser } from "@/lib/auth";
import { getAnalyticsSummary } from "@/services/analytics.service";
import { Card, CardContent } from "@/components/ui/card";

export default async function ProjectAnalyticsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  const { projectId } = await params;
  const summary = await getAnalyticsSummary(user!.id, projectId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-semibold tabular-nums">{summary.totalVisits}</p>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">Total visits</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-semibold tabular-nums">{summary.uniqueVisitors}</p>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">Unique visitors</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-semibold tabular-nums">{summary.eventCounts["hotspot_clicked"] ?? 0}</p>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">Hotspots clicked</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-semibold tabular-nums">{summary.eventCounts["booking_clicked"] ?? 0}</p>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">Booking clicks</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5">
          <h2 className="text-sm font-semibold">Most visited spaces</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {summary.topSpaces.map(
              (row) =>
                row.space && (
                  <li key={row.space.id} className="flex justify-between">
                    <span>{row.space.name}</span>
                    <span className="text-[var(--fg-muted)]">{row.views} views</span>
                  </li>
                )
            )}
            {summary.topSpaces.length === 0 && <li className="text-[var(--fg-muted)]">No data yet.</li>}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h2 className="text-sm font-semibold">Devices</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {Object.entries(summary.deviceBreakdown).map(([device, count]) => (
              <li key={device} className="flex justify-between">
                <span className="capitalize">{device}</span>
                <span className="text-[var(--fg-muted)]">{count}</span>
              </li>
            ))}
            {Object.keys(summary.deviceBreakdown).length === 0 && (
              <li className="text-[var(--fg-muted)]">No data yet.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
