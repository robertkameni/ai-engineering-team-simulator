const PDF_COMPILE_AUTHOR = "AI Engineering Team Simulator";

function buildPdfAttachmentResponse(
  pdf: Buffer,
  filename: string,
): Response {
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

type CompileRunPdf = (
  markdown: string,
  options: { title: string; author?: string },
) => Promise<Buffer>;

/**
 * Compile markdown to a PDF attachment, or a generic 500 on compile failure.
 */
export async function buildCompiledPdfAttachmentResponse(params: {
  readonly markdown: string;
  readonly title: string;
  readonly filename: string;
  readonly compileRunPdfFromMarkdown: CompileRunPdf;
}): Promise<Response> {
  try {
    const pdf = await params.compileRunPdfFromMarkdown(params.markdown, {
      title: params.title,
      author: PDF_COMPILE_AUTHOR,
    });
    return buildPdfAttachmentResponse(pdf, params.filename);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PDF generation failed";
    console.error("[export/pdf]", message, error);
    return Response.json({ error: "PDF generation failed" }, { status: 500 });
  }
}
