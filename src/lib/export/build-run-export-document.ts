import type { TeamTemplateId } from "@/ai/agents/team-templates";
import { ARTIFACT_TYPES } from "@/features/artifacts/artifact-constants";
import type { ArtifactType } from "@/features/artifacts/artifact-constants";
import {
  debateOutcomeLabel,
  debateOutcomeWarningMessage,
  isUnapprovedDebateOutcome,
} from "@/features/artifacts/artifact-panel-phase";
import { getArtifactTabConfig } from "@/features/artifacts/artifact-tab-styles";
import type { MockRun } from "@/features/agents/types";
import {
  parseMessageBlocks,
  type MessageBlock,
} from "@/features/simulation/parse-message-blocks";

export interface RunExportContext {
  run: MockRun;
  templateId?: TeamTemplateId;
}

function resolveTemplateId(templateId?: TeamTemplateId): TeamTemplateId {
  return templateId ?? "software";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function appendMetadata(lines: string[], ctx: RunExportContext): void {
  const { run } = ctx;
  lines.push("**Prompt:** " + run.userPrompt, "");
  lines.push(
    "**Status:** " + run.status + " · **Updated:** " + run.updatedAt,
    "",
  );

  if (run.usage) {
    const cost =
      run.usage.estimatedCostUsd > 0
        ? " · **Est. cost:** $" + run.usage.estimatedCostUsd.toFixed(4)
        : "";
    lines.push(
      "**Usage:** " +
        run.usage.promptTokens.toLocaleString() +
        " prompt · " +
        run.usage.completionTokens.toLocaleString() +
        " completion · " +
        run.usage.totalTokens.toLocaleString() +
        " total" +
        cost,
      "",
    );
  }

  if (run.debateOutcome) {
    const label = debateOutcomeLabel(run.debateOutcome);
    if (isUnapprovedDebateOutcome(run.debateOutcome)) {
      lines.push(
        "**Debate outcome:** " +
          label +
          " — " +
          debateOutcomeWarningMessage(run.debateOutcome),
        "",
      );
    } else {
      lines.push("**Debate outcome:** " + label, "");
    }
  }
}

function appendMetadataHtml(parts: string[], ctx: RunExportContext): void {
  const { run } = ctx;
  parts.push(
    '<p class="meta-block"><strong>Prompt:</strong> ' +
      formatInlineMarkdown(run.userPrompt) +
      "</p>",
    '<p class="meta-block"><strong>Status:</strong> ' +
      escapeHtml(run.status) +
      " · <strong>Updated:</strong> " +
      escapeHtml(run.updatedAt) +
      "</p>",
  );

  if (run.usage) {
    const cost =
      run.usage.estimatedCostUsd > 0
        ? " · <strong>Est. cost:</strong> $" +
          run.usage.estimatedCostUsd.toFixed(4)
        : "";
    parts.push(
      '<p class="meta-block"><strong>Usage:</strong> ' +
        run.usage.promptTokens.toLocaleString() +
        " prompt · " +
        run.usage.completionTokens.toLocaleString() +
        " completion · " +
        run.usage.totalTokens.toLocaleString() +
        " total" +
        cost +
        "</p>",
    );
  }

  if (run.debateOutcome) {
    const label = escapeHtml(debateOutcomeLabel(run.debateOutcome));
    if (isUnapprovedDebateOutcome(run.debateOutcome)) {
      parts.push(
        '<div class="export-warning"><strong>Debate outcome:</strong> ' +
          label +
          " — " +
          escapeHtml(debateOutcomeWarningMessage(run.debateOutcome)) +
          "</div>",
      );
    } else {
      parts.push(
        '<p class="meta-block"><strong>Debate outcome:</strong> ' +
          label +
          "</p>",
      );
    }
  }
}

function blocksToMarkdown(blocks: MessageBlock[]): string[] {
  const lines: string[] = [];

  for (const block of blocks) {
    if (block.type === "spacer") {
      lines.push("");
      continue;
    }
    if (block.type === "heading") {
      const prefix = block.level === 2 ? "## " : "### ";
      lines.push(prefix + block.text, "");
      continue;
    }
    if (block.type === "quote") {
      lines.push(
        "> **" + block.agentName + ":** " + block.text,
        block.verdict ? "> *" + block.verdict + "*" : "",
        "",
      );
      continue;
    }
    if (block.type === "bullet") {
      lines.push("- " + block.text);
      continue;
    }
    if (block.type === "emphasis") {
      lines.push("**" + block.text + "**", "");
      continue;
    }
    lines.push(block.text, "");
  }

  return lines;
}

function blocksToHtml(blocks: MessageBlock[]): string {
  const parts: string[] = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      parts.push("</ul>");
      listOpen = false;
    }
  };

  for (const block of blocks) {
    if (block.type === "spacer") {
      closeList();
      continue;
    }

    if (block.type === "heading") {
      closeList();
      const tag = block.level === 2 ? "h2" : "h3";
      parts.push(
        "<" + tag + ">" + escapeHtml(block.text) + "</" + tag + ">",
      );
      continue;
    }
    if (block.type === "quote") {
      closeList();
      const verdictHtml = block.verdict
        ? "<p><em>" + escapeHtml(block.verdict) + "</em></p>"
        : "";
      parts.push(
        '<blockquote class="export-quote"><cite>' +
          escapeHtml(block.agentName) +
          "</cite>" +
          formatInlineMarkdown(block.text) +
          verdictHtml +
          "</blockquote>",
      );
      continue;
    }
    if (block.type === "bullet") {
      if (!listOpen) {
        parts.push("<ul>");
        listOpen = true;
      }
      parts.push("<li>" + formatInlineMarkdown(block.text) + "</li>");
      continue;
    }
    closeList();
    if (block.type === "emphasis") {
      parts.push("<p><strong>" + escapeHtml(block.text) + "</strong></p>");
      continue;
    }
    parts.push("<p>" + formatInlineMarkdown(block.text) + "</p>");
  }

  closeList();
  return parts.join("\n");
}

function artifactLabelMap(templateId: TeamTemplateId): Map<ArtifactType, string> {
  const tabs = getArtifactTabConfig(templateId);
  return new Map(tabs.map((tab) => [tab.value, tab.label]));
}

function appendArtifactsMarkdown(
  lines: string[],
  ctx: RunExportContext,
  templateId: TeamTemplateId,
): void {
  const { run } = ctx;
  if (!run.artifacts) return;

  const labels = artifactLabelMap(templateId);
  lines.push("## Artifacts", "");

  for (const type of ARTIFACT_TYPES) {
    const sections = run.artifacts[type];
    if (!sections) continue;

    const tabLabel = labels.get(type) ?? type;
    lines.push("### " + tabLabel, "");
    for (const section of sections) {
      lines.push("#### " + section.title, "");
      for (const item of section.items) {
        lines.push("- " + item);
      }
      lines.push("");
    }
  }
}

function appendArtifactsHtml(
  parts: string[],
  ctx: RunExportContext,
  templateId: TeamTemplateId,
): void {
  const { run } = ctx;
  if (!run.artifacts) return;

  const labels = artifactLabelMap(templateId);
  parts.push("<h2>Artifacts</h2>");

  for (const type of ARTIFACT_TYPES) {
    const sections = run.artifacts[type];
    if (!sections) continue;

    const tabLabel = labels.get(type) ?? type;
    parts.push(
      '<section class="artifact-panel artifact-panel--' + type + '">',
      "<h3>" + escapeHtml(tabLabel) + "</h3>",
    );
    for (const section of sections) {
      parts.push("<h4>" + escapeHtml(section.title) + "</h4>", "<ul>");
      for (const item of section.items) {
        parts.push("<li>" + formatInlineMarkdown(item) + "</li>");
      }
      parts.push("</ul>");
    }
    parts.push("</section>");
  }
}

export function buildRunMarkdown(ctx: RunExportContext): string {
  const { run } = ctx;
  const templateId = resolveTemplateId(ctx.templateId);
  const lines: string[] = ["# " + run.title, ""];

  appendMetadata(lines, ctx);
  lines.push("---", "", "## Team discussion", "");

  for (const message of run.messages) {
    const name = message.agentName ?? message.role;
    const title = message.agentTitle ?? message.role;
    lines.push("### " + name + " (" + title + ")", "");
    lines.push(...blocksToMarkdown(parseMessageBlocks(message.content.trim())));
    lines.push("---", "");
  }

  appendArtifactsMarkdown(lines, ctx, templateId);

  return lines.join("\n").trimEnd() + "\n";
}

export function buildRunStyledMarkdown(ctx: RunExportContext): string {
  const { run } = ctx;
  const templateId = resolveTemplateId(ctx.templateId);
  const parts: string[] = ["# " + run.title, ""];

  appendMetadataHtml(parts, ctx);
  parts.push("<hr />", "<h2>Team discussion</h2>");

  for (const message of run.messages) {
    const name = message.agentName ?? message.role;
    const title = message.agentTitle ?? message.role;
    const role = message.role;
    const bodyHtml = blocksToHtml(parseMessageBlocks(message.content.trim()));

    parts.push(
      '<div class="message message--' + role + '">',
      '<h3 class="message-heading">' +
        escapeHtml(name) +
        ' <span style="font-weight:400;color:#5c5c6e">(' +
        escapeHtml(title) +
        ")</span></h3>",
      '<div class="message-body">' + bodyHtml + "</div>",
      "</div>",
    );
  }

  appendArtifactsHtml(parts, ctx, templateId);

  return parts.join("\n");
}
