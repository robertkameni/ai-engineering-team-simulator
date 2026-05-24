import type { ArtifactType } from "@/features/artifacts/artifact-constants";
import { ARTIFACT_TYPES } from "@/features/artifacts/artifact-constants";
import type { MockRun } from "@/features/agents/types";

const ARTIFACT_LABELS: Record<ArtifactType, string> = {
  requirements: "Requirements",
  architecture: "Architecture",
  implementation: "Implementation",
  review: "Review",
};

export function buildRunMarkdown(run: MockRun): string {
  const lines: string[] = [
    `# ${run.title}`,
    "",
    `**Prompt:** ${run.userPrompt}`,
    "",
    `**Status:** ${run.status} · **Updated:** ${run.updatedAt}`,
    "",
    "---",
    "",
    "## Team discussion",
    "",
  ];

  for (const message of run.messages) {
    const name = message.agentName ?? message.role;
    const title = message.agentTitle ?? message.role;
    lines.push(`### ${name} (${title})`, "", message.content.trim(), "", "---", "");
  }

  if (run.artifacts) {
    lines.push("## Artifacts", "");

    for (const type of ARTIFACT_TYPES) {
      const sections = run.artifacts[type];
      if (!sections) continue;

      lines.push(`### ${ARTIFACT_LABELS[type]}`, "");
      for (const section of sections) {
        lines.push(`#### ${section.title}`, "");
        for (const item of section.items) {
          lines.push(`- ${item}`);
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

export function buildRunMarkdownFilename(title: string, exportId?: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  const base = slug || "simulation-run";
  return exportId ? `${base}-${exportId}.md` : `${base}.md`;
}

export function buildRunExportUrl(runId: string, exportId?: number): string {
  const base = `/api/runs/${encodeURIComponent(runId)}/export`;
  return exportId != null ? `${base}?t=${exportId}` : base;
}

export function buildRunExportPayload(run: MockRun, exportId: number = Date.now()) {
  const markdown = `${buildRunMarkdown(run)}<!-- export-id: ${exportId} -->\n`;
  const filename = buildRunMarkdownFilename(run.title, exportId);
  return { markdown, filename, exportId };
}

function downloadMarkdownFile(markdown: string, filename: string) {
  const blob = new Blob([markdown], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function canUseNativeSavePicker(): boolean {
  return (
    typeof window !== "undefined" &&
    "showSaveFilePicker" in window &&
    typeof (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker ===
      "function"
  );
}

async function saveMarkdownWithNativePicker(
  markdown: string,
  filename: string,
): Promise<boolean> {
  if (!canUseNativeSavePicker()) {
    return false;
  }

  const showSaveFilePicker = (
    window as unknown as {
      showSaveFilePicker: (options: {
        suggestedName: string;
        types: Array<{
          description: string;
          accept: Record<string, string[]>;
        }>;
      }) => Promise<FileSystemFileHandle>;
    }
  ).showSaveFilePicker;

  try {
    const handle = await showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: "Markdown document",
          accept: { "text/markdown": [".md"] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(markdown);
    await writable.close();
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return true;
    }
    return false;
  }
}

export async function exportRunMarkdown(run: MockRun): Promise<void> {
  const { markdown, filename } = buildRunExportPayload(run);

  const savedWithPicker = await saveMarkdownWithNativePicker(markdown, filename);
  if (savedWithPicker) {
    return;
  }

  downloadMarkdownFile(markdown, filename);
}

export function canExportRunFromServer(run: MockRun): boolean {
  return Boolean(run.id && run.id !== "live");
}
