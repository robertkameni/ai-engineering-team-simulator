import { listRecentRunsForSidebar } from "@/lib/db/runs";

export const runtime = "nodejs";

export async function GET() {
  const runs = await listRecentRunsForSidebar(12);
  return Response.json({ runs });
}
