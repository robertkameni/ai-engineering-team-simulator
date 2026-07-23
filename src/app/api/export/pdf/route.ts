import { requireRunAccess } from "@/lib/auth/run-ownership";
import { buildRunStyledMarkdown } from "@/lib/export/build-run-export-document";
import { buildRunPdfFilename } from "@/lib/export/export-filename";
import {
  exportPdfPostBodySchema,
  toRunExportContext,
} from "@/lib/export/export-pdf-payload";
import { EXPORT_PDF_MAX_BODY_BYTES } from "@/lib/export/export-pdf-limits";
import { handleSavedRunPdfExport } from "@/lib/export/handle-saved-run-pdf-export";
import { buildCompiledPdfAttachmentResponse } from "@/lib/export/pdf-attachment-response";
import { requireAuthenticatedExportSession } from "@/lib/export/require-authenticated-export-session";
import { compileRunPdfFromMarkdown } from "@/lib/export/run-pdf";
import { assertRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const PLACEHOLDER_RUN_IDS = new Set(["live", "new"]);

/**
 * Live PDF export. Arch-review F7: when run.id is a persisted owned run,
 * rebuild from DB (ignore client body). Body path is for in-flight placeholders only.
 */
export async function POST(request: Request) {
  const session = await requireAuthenticatedExportSession();
  if (!session.ok) {
    return session.response;
  }
  const { userId } = session;

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (Buffer.byteLength(rawBody, "utf8") > EXPORT_PDF_MAX_BODY_BYTES) {
    return Response.json(
      { error: "Export payload too large" },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = exportPdfPostBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid export payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const runId = parsed.data.run.id;
  if (!PLACEHOLDER_RUN_IDS.has(runId)) {
    const access = await requireRunAccess(runId, {
      userId,
      guestSessionId: null,
    });
    if (access.ok) {
      // Owned persisted run — server rebuild; rate limit lives inside handler.
      return handleSavedRunPdfExport(request, runId, userId);
    }
  }

  const rateLimit = await assertRateLimit(request, "export_pdf", userId);
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit);
  }

  const ctx = toRunExportContext(parsed.data);
  const markdown = buildRunStyledMarkdown(ctx);
  const exportId = Date.now();
  const filename = buildRunPdfFilename(ctx.run.title, exportId);

  return buildCompiledPdfAttachmentResponse({
    markdown,
    title: ctx.run.title,
    filename,
    compileRunPdfFromMarkdown,
  });
}
