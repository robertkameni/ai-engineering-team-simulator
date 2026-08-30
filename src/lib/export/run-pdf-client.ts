"use client";

import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { MockRun } from "@/lib/types";
import { buildRunPdfFilename } from "@/lib/export/export-filename";
import { downloadExportBlob } from "@/lib/export/download-export-blob";
import {
  canUseNativeSavePicker,
  openSavePickerForBlob,
} from "@/lib/export/save-export-file";

function canExportRunPdfFromServer(run: MockRun): boolean {
  return Boolean(run.id && run.id !== "live");
}

function buildSavedRunPdfUrl(runId: string, exportId: number): string {
  return `/api/runs/${encodeURIComponent(runId)}/export/pdf?t=${exportId}`;
}

async function readPdfBlobFromResponse(response: Response): Promise<Blob> {
  if (!response.ok) {
    let message = "PDF export failed";
    try {
      const data = (await response.json()) as { error?: string; };
      if (data.error) message = data.error;
    } catch {
      /* ignore */
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

async function fetchPdfBlob(url: string): Promise<Blob> {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  return readPdfBlobFromResponse(response);
}

async function exportSavedRunPdf(
  run: MockRun,
  onFetchStarted?: () => void,
): Promise<void> {
  const exportId = Date.now();
  const url = buildSavedRunPdfUrl(run.id, exportId);
  const filename = buildRunPdfFilename(run.title, exportId);

  if (canUseNativeSavePicker()) {
    // openSavePickerForBlob must come before fetchPdfBlob — no await before it —
    // so it runs within the browser's user-gesture window on every click.
    const pickerPromise = openSavePickerForBlob(filename, "PDF document", {
      "application/pdf": [".pdf"],
    });
    const fetchPromise = fetchPdfBlob(url);

    onFetchStarted?.();

    const [pickerResult, fetchResult] = await Promise.allSettled([
      pickerPromise,
      fetchPromise,
    ]);

    if (fetchResult.status === "rejected") {
      throw fetchResult.reason as Error;
    }

    const save =
      pickerResult.status === "fulfilled" ? pickerResult.value : null;

    if (save === null) {
      return;
    }

    await save(fetchResult.value);
    return;
  }

  onFetchStarted?.();
  const blob = await fetchPdfBlob(url);
  downloadExportBlob(blob, filename, "application/pdf");
}

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

  const blob = await readPdfBlobFromResponse(response);

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
