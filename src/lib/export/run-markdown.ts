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
      lines.push(`### ${ARTIFACT_LABELS[type]}`, "");
      for (const section of run.artifacts[type]) {
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

export function downloadRunMarkdown(run: MockRun) {
  const markdown = buildRunMarkdown(run);
  const slug = run.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slug || "simulation-run"}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}
