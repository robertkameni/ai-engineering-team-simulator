import { listRecentRuns } from "@/lib/db/runs";
import { toAppRunStatus } from "@/lib/db/run-status";

export const runtime = "nodejs";

export async function GET() {
  const runs = await listRecentRuns(12);

  return Response.json({
    runs: runs.map((run) => ({
      id: run.id,
      title:
        run.userPrompt.length > 48
          ? `${run.userPrompt.slice(0, 48).trim()}…`
          : run.userPrompt,
      status: toAppRunStatus(run.status),
      updatedAt: formatRelativeTime(run.updatedAt),
    })),
  });
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}
