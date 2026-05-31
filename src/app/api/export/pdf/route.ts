import { getSessionUser } from "@/lib/auth/session";
import { buildRunStyledMarkdown } from "@/lib/export/build-run-export-document";
import { buildRunPdfFilename } from "@/lib/export/export-filename";
import {
  exportPdfPostBodySchema,
  toRunExportContext,
} from "@/lib/export/export-pdf-payload";
import { EXPORT_PDF_MAX_BODY_BYTES } from "@/lib/export/export-pdf-limits";
import { compileRunPdfFromMarkdown } from "@/lib/export/run-pdf";
import { assertRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const { userId } = await getSessionUser();
  if (!userId) {
    return Response.json(
      { error: "Authentication required to export" },
      { status: 401 },
    );
  }

  const rateLimit = await assertRateLimit(request, "export_pdf", userId);
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit);
  }

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

  const ctx = toRunExportContext(parsed.data);
  const markdown = buildRunStyledMarkdown(ctx);
  const exportId = Date.now();
  const filename = buildRunPdfFilename(ctx.run.title, exportId);

  let pdf: Buffer;
  try {
    pdf = await compileRunPdfFromMarkdown(markdown, {
      title: ctx.run.title,
      author: "AI Engineering Team Simulator",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PDF generation failed";
    console.error("[export/pdf]", message, error);
    return Response.json({ error: "PDF generation failed" }, { status: 500 });
  }

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.byteLength),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}
