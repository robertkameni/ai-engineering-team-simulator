import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { MockRun } from "@/features/agents/types";
import { buildRunPdfFilename } from "@/lib/export/export-filename";
import { downloadExportBlob } from "@/lib/export/download-export-blob";
import {
  canUseNativeSavePicker,
  openSavePickerForBlob,
} from "@/lib/export/save-export-file";

export function canExportRunPdfFromServer(run: MockRun): boolean {
  return Boolean(run.id && run.id !== "live");
}

function buildSavedRunPdfUrl(runId: string, exportId: number): string {
  return `/api/runs/${encodeURIComponent(runId)}/export/pdf?t=${exportId}`;
}

async function fetchPdfBlob(url: string): Promise<Blob> {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

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
  if (blob.size === 0) throw new Error("PDF export returned an empty file");
  return blob;
}

/**
 * Saved runs.
 *
 * Strategy (Chrome / Edge with File System Access API):
 *   1. `openSavePickerForBlob` is called **before any other `await`** so it
 *      runs while the browser still considers this a user gesture.  The user
 *      picks a save location immediately.
 *   2. After the picker resolves we fetch the PDF (shows spinner).
 *   3. The PDF bytes are written directly to the chosen file — no blob URL,
 *      no programmatic click, no Chrome "multiple downloads" block.
 *
 * Fallback (Firefox / Safari / no File System Access API):
 *   Regular fetch → blob → <a download>.click().  Repeat-download reliability
 *   depends on the browser.
 */
export async function exportSavedRunPdf(run: MockRun): Promise<void> {
  const exportId = Date.now();
  const url = buildSavedRunPdfUrl(run.id, exportId);
  const filename = buildRunPdfFilename(run.title, exportId);

  if (canUseNativeSavePicker()) {
    // ⚠️  Must be the FIRST await — called before fetch() to stay in the
    //     user-gesture window so Chrome opens the picker every time.
    const save = await openSavePickerForBlob(filename, "PDF document", {
      "application/pdf": [".pdf"],
    });

    if (save === null) {
      // User cancelled (AbortError) or picker unavailable — bail out silently
      // for cancel, fall through to blob for unavailable.
      return;
    }

    const blob = await fetchPdfBlob(url);
    await save(blob);
    return;
  }

  // Fallback: fetch → blob → programmatic link click
  const blob = await fetchPdfBlob(url);
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
  if (blob.size === 0) throw new Error("PDF export returned an empty file");

  const filename = buildRunPdfFilename(fallbackTitle, Date.now());
  downloadExportBlob(blob, filename, "application/pdf");
}

/** Live (unsaved) runs — must send JSON payload to the server. */
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
