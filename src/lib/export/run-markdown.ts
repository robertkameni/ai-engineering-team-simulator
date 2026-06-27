import {
  buildRunMarkdown,
  type RunExportContext,
} from "@/lib/export/build-run-export-document";
import {
  buildRunMarkdownFilename,
} from "@/lib/export/export-filename";
import { downloadExportBlob } from "@/lib/export/download-export-blob";
import { openSavePickerForBlob } from "@/lib/export/save-export-file";
import type { MockRun } from "@/features/agents/types";
import type { TeamTemplateId } from "@/ai/agents/team-templates";

export { type RunExportContext };

function buildRunExportUrl(runId: string, exportId?: number): string {
  const base = `/api/runs/${encodeURIComponent(runId)}/export`;
  return exportId != null ? `${base}?t=${exportId}` : base;
}

function buildRunExportPayload(
  run: MockRun,
  templateId?: TeamTemplateId,
  exportId: number = Date.now(),
) {
  const ctx: RunExportContext = { run, templateId };
  const markdown = `${buildRunMarkdown(ctx)}<!-- export-id: ${exportId} -->\n`;
  const filename = buildRunMarkdownFilename(run.title, exportId);
  return { markdown, filename, exportId };
}

export async function exportRunMarkdown(
  run: MockRun,
  templateId?: TeamTemplateId,
): Promise<void> {
  const { markdown, filename } = buildRunExportPayload(run, templateId);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });

  const save = await openSavePickerForBlob(filename, "Markdown document", {
    "text/markdown": [".md"],
  });

  if (save !== null) {
    await save(blob);
    return;
  }

  downloadExportBlob(blob, filename, "text/markdown");
}

function canExportRunFromServer(run: MockRun): boolean {
  return Boolean(run.id && run.id !== "live");
}
