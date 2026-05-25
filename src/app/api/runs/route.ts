import { listRecentRunsForSidebar } from "@/lib/db/runs";
import { getRunOwnershipContext } from "@/lib/auth/run-ownership";

export const runtime = "nodejs";

export async function GET() {
  const ownership = await getRunOwnershipContext();
  const runs = await listRecentRunsForSidebar(ownership, 12);
  return Response.json({ runs });
}
