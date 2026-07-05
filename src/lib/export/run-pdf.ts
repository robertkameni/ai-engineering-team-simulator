import "server-only";

import { mdToPdf } from "md-to-pdf";

import {
  PDF_DOCUMENT_TITLE,
} from "@/lib/export/export-pdf-limits";
import { EXPORT_PRINT_CSS } from "@/lib/export/export-theme";

export interface CompileRunPdfOptions {
  title: string;
  author?: string;
}

let pdfCompileChain: Promise<void> = Promise.resolve();

function enqueuePdfCompile<T>(task: () => Promise<T>): Promise<T> {
  const run = pdfCompileChain.then(task);
  pdfCompileChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function compileRunPdfFromMarkdown(
  markdown: string,
  options: CompileRunPdfOptions,
): Promise<Buffer> {
  return enqueuePdfCompile(() => compileRunPdfFromMarkdownInner(markdown, options));
}

async function compileRunPdfFromMarkdownInner(
  markdown: string,
  _options: CompileRunPdfOptions,
): Promise<Buffer> {
  const result = await mdToPdf(
    { content: markdown },
    {
      basedir: process.cwd(),
      stylesheet: [],
      css: EXPORT_PRINT_CSS,
      document_title: PDF_DOCUMENT_TITLE,
      page_media_type: "print",
      pdf_options: {
        format: "a4",
        printBackground: true,
        margin: {
          top: "20mm",
          right: "20mm",
          bottom: "20mm",
          left: "20mm",
        },
      },
      launch_options: {
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    },
  );

  const raw = result?.content;
  if (!raw || (raw.length ?? 0) === 0) {
    throw new Error("PDF generation returned empty output");
  }

  return Buffer.from(raw);
}
