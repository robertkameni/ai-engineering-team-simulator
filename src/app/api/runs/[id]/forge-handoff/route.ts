import { handleForgeHandoffPost } from "@/lib/api/handle-forge-handoff-post";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  return handleForgeHandoffPost(request, id);
}
