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
 * When the native Save picker is available (Chrome/Edge):
 *   1. `openSavePickerForBlob` and `fetchPdfBlob` are started **in parallel**,
 *      both before any `await`, so the Save dialog opens at the same instant
 *      the server starts generating the PDF.
 *   2. `openSavePickerForBlob` is called first (synchronously, before any
 *      await) so it is still within the browser's user-gesture window — the
 *      dialog opens on every click, not just the first.
 *   3. `onFetchStarted` fires immediately (spinner on) so the user sees
 *      feedback while choosing a save location.
 *   4. `Promise.allSettled` waits for both; we only write to disk once we
 *      have both the file handle and the blob.
 *
 * Fallback (Firefox / no File System Access API):
 *   fetch → blob → <a download>.click().
 */
async function exportSavedRunPdf(
  run: MockRun,
  onFetchStarted?: () => void,
): Promise<void> {
  const exportId = Date.now();
  const url = buildSavedRunPdfUrl(run.id, exportId);
  const filename = buildRunPdfFilename(run.title, exportId);

  if (canUseNativeSavePicker()) {
    // ⚠️  openSavePickerForBlob MUST be called before fetchPdfBlob (no await
    //     before it) to stay in the user-gesture window every time.
    const pickerPromise = openSavePickerForBlob(filename, "PDF document", {
      "application/pdf": [".pdf"],
    });
    // Start the fetch in parallel so the PDF generates while the user
    // is choosing a save location.
    const fetchPromise = fetchPdfBlob(url);

    onFetchStarted?.(); // spinner ON — both operations are now running

    const [pickerResult, fetchResult] = await Promise.allSettled([
      pickerPromise,
      fetchPromise,
    ]);

    // If the fetch failed, re-throw so performExport shows the error.
    if (fetchResult.status === "rejected") {
      throw fetchResult.reason as Error;
    }

    const save =
      pickerResult.status === "fulfilled" ? pickerResult.value : null;

    if (save === null) {
      // User cancelled the dialog (AbortError) — silent no-op.
      return;
    }

    await save(fetchResult.value);
    return;
  }

  // Fallback: no native picker — show spinner before the fetch.
  onFetchStarted?.();
  const blob = await fetchPdfBlob(url);
  downloadExportBlob(blob, filename, "application/pdf");
}

/** Live (unsaved) runs — must send JSON payload to the server. */
async function exportLiveRunPdf(
  run: MockRun,
  templateId: TeamTemplateId | undefined,
  onFetchStarted?: () => void,
): Promise<void> {
  onFetchStarted?.();
  const response = await fetch("/api/export/pdf", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run, templateId }),
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

  const filename = buildRunPdfFilename(run.title, Date.now());
  downloadExportBlob(blob, filename, "application/pdf");
}

export async function exportRunPdf(
  run: MockRun,
  templateId: TeamTemplateId | undefined,
  onFetchStarted?: () => void,
): Promise<void> {
  if (canExportRunPdfFromServer(run)) {
    await exportSavedRunPdf(run, onFetchStarted);
    return;
  }
  await exportLiveRunPdf(run, templateId, onFetchStarted);
}
