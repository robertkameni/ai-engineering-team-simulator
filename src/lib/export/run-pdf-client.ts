import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { MockRun } from "@/features/agents/types";
import { buildRunPdfFilename } from "@/lib/export/export-filename";
import { downloadExportBlob } from "@/lib/export/download-export-blob";
import { saveBlobWithNativePicker } from "@/lib/export/save-export-file";

export function canExportRunPdfFromServer(run: MockRun): boolean {
  return Boolean(run.id && run.id !== "live");
}

function buildSavedRunPdfUrl(runId: string, exportId: number): string {
  return `/api/runs/${encodeURIComponent(runId)}/export/pdf?t=${exportId}`;
}

async function deliverPdfBlob(blob: Blob, title: string): Promise<void> {
  const filename = buildRunPdfFilename(title, Date.now());

  const pickerResult = await saveBlobWithNativePicker(
    blob,
    filename,
    "PDF document",
    { "application/pdf": [".pdf"] },
  );
  if (pickerResult === "saved" || pickerResult === "aborted") {
    return;
  }

  downloadExportBlob(blob, filename, "application/pdf");
}

async function downloadPdfFromFetch(
  response: Response,
  fallbackTitle: string,
): Promise<void> {
  if (!response.ok) {
    let message = "PDF export failed";
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/pdf")) {
    throw new Error("PDF export failed. Sign in or try again.");
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error("PDF export returned an empty file");
  }

  await deliverPdfBlob(blob, fallbackTitle);
}

/** Saved runs — fetch PDF; spinner should await this promise. */
export async function exportSavedRunPdf(run: MockRun): Promise<void> {
  const exportId = Date.now();
  const response = await fetch(buildSavedRunPdfUrl(run.id, exportId), {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  await downloadPdfFromFetch(response, run.title);
}

/** Live (unsaved) runs — must fetch JSON payload and compile on the server. */
export async function exportLiveRunPdf(
  run: MockRun,
  templateId?: TeamTemplateId,
): Promise<void> {
  const response = await fetch("/api/export/pdf", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run, templateId }),
  });

  await downloadPdfFromFetch(response, run.title);
}

export async function exportRunPdf(
  run: MockRun,
  templateId?: TeamTemplateId,
): Promise<void> {
  if (canExportRunPdfFromServer(run)) {
    await exportSavedRunPdf(run);
    return;
  }
  await exportLiveRunPdf(run, templateId);
}
