import {
  buildRunMarkdown,
  buildRunMarkdownFilename,
} from "@/lib/export/run-markdown";
import { getRunForWorkspace } from "@/lib/db/runs";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const run = await getRunForWorkspace(id);

  if (!run) {
    return new Response("Run not found", { status: 404 });
  }

  const markdown = buildRunMarkdown(run);
  const exportId = Date.now();
  const filename = buildRunMarkdownFilename(run.title, exportId);

  return new Response(`${markdown}<!-- export-id: ${exportId} -->\n`, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}
