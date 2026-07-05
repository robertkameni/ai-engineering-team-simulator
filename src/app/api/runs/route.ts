import { listRecentRunsForSidebar } from "@/lib/db/runs";
import { getRunOwnershipContext } from "@/lib/auth/run-ownership";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ownership = await getRunOwnershipContext();
    const runs = await listRecentRunsForSidebar(ownership, 12);
    return Response.json({ runs });
  } catch (error) {
    console.error("Failed to list runs:", error);
    return Response.json(
      { error: "Failed to load runs" },
      { status: 500 },
    );
  }
}
