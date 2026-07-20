import { isSimulationAgent } from "@/ai/agents/config";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { AgentRole } from "@/features/agents/types";
import { formatExportDate } from "@/lib/format-time";
import { ARTIFACT_TYPES } from "@/features/artifacts/artifact-constants";
import type { ArtifactType } from "@/features/artifacts/artifact-constants";
import {
  debateOutcomeLabel,
  debateOutcomeWarningMessage,
  isUnapprovedDebateOutcome,
} from "@/features/artifacts/artifact-panel-phase";
import {
  hasSynthesisValidationWarnings,
  parseSynthesisValidationFlags,
  synthesisValidationWarningMessage,
} from "@/features/artifacts/synthesis-validation";
import { getArtifactTabConfig } from "@/features/artifacts/artifact-tab-styles";
import type { MockRun } from "@/features/agents/types";
import { hasRecordedRunUsage } from "@/lib/ai/run-usage";
import {
  appendOpsFollowUpMetadataHtml,
  appendOpsFollowUpMetadataLines,
  opsFollowUpFieldsFromCheckpoint,
} from "@/lib/db/ops-follow-up-summary";
import {
  parseMessageBlocks,
  type MessageBlock,
} from "@/features/simulation/parse-message-blocks";

export interface RunExportContext {
  run: MockRun;
  templateId?: TeamTemplateId;
}

interface RunOpsFollowUpExportFields {
  readonly last: ReturnType<typeof opsFollowUpFieldsFromCheckpoint>;
  readonly architectCheckpoint: import("@/lib/db/ops-follow-up-summary").OpsFollowUpCheckpoint | null;
}

function resolveRunOpsFollowUpFields(run: MockRun): RunOpsFollowUpExportFields {
  const last = opsFollowUpFieldsFromCheckpoint(
    run.opsFollowUpEvaluated
      ? {
          opsFollowUpEvaluated: run.opsFollowUpEvaluated,
          opsFollowUpTriggered: run.opsFollowUpTriggered ?? false,
          opsFollowUpSkipReason: run.opsFollowUpSkipReason ?? null,
          opsFollowUpEligible: run.opsFollowUpEligible ?? false,
          opsFollowUpUnresolvedDevopsIssueCount:
            run.opsFollowUpUnresolvedDevopsIssueCount ?? 0,
          opsFollowUpLastCorrectionRole:
            run.opsFollowUpLastCorrectionRole ?? null,
          opsFollowUpEvaluationTurn: run.opsFollowUpEvaluationTurn ?? null,
        }
      : null,
  );
  return { last, architectCheckpoint: run.opsFollowUpArchitectCheckpoint ?? null };
}

function resolveTemplateId(templateId?: TeamTemplateId): TeamTemplateId {
  return templateId ?? "software";
}

function resolveExportMessageRoleClass(role: string): string {
  if (isSimulationAgent(role as AgentRole)) {
    return role;
  }
  return "unknown";
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
    "**Simulated:** " + formatExportDate(run.updatedAt),
    "",
  );

  if (hasRecordedRunUsage(run.usage)) {
    const cost =
      run.usage.estimatedCostUsd > 0
        ? " · **Est. cost:** $" + run.usage.estimatedCostUsd.toFixed(4)
        : "";
    const missingNote =
      run.usage.usageMissing === true ? " · **usageMissing:** true" : "";
    const peakNote =
      run.usage.peakPromptTokens != null || run.peakPromptTokens != null
        ? " · **Peak prompt:** " +
          (run.usage.peakPromptTokens ?? run.peakPromptTokens)!.toLocaleString()
        : "";
    lines.push(
      "**Usage:** " +
        run.usage.promptTokens.toLocaleString() +
        " prompt · " +
        run.usage.completionTokens.toLocaleString() +
        " completion · " +
        run.usage.totalTokens.toLocaleString() +
        " total" +
        cost +
        peakNote +
        missingNote,
      "",
    );
  }

  if (run.debateDurationMs != null || run.artifactDurationMs != null || run.totalDurationMs != null) {
    const parts: string[] = [];
    if (run.debateDurationMs != null) {
      parts.push("debate " + run.debateDurationMs + "ms");
    }
    if (run.artifactDurationMs != null) {
      parts.push("artifacts " + run.artifactDurationMs + "ms");
    }
    if (run.totalDurationMs != null) {
      parts.push("total " + run.totalDurationMs + "ms");
    }
    lines.push("**Duration:** " + parts.join(" · "), "");
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
    if (run.postApproveTruncation === true) {
      lines.push(
        "**Warning:** postApproveTruncation — reviewer approved but some critical turns were truncated.",
        "",
      );
    }
  }

  const synthesisValidation = parseSynthesisValidationFlags(
    run.stackValidationFailed,
    run.crossValidationFailed,
  );
  if (hasSynthesisValidationWarnings(synthesisValidation)) {
    lines.push(
      "**Artifact validation:** " +
        synthesisValidationWarningMessage(synthesisValidation),
      "",
    );
  }

  const opsFields = resolveRunOpsFollowUpFields(run);
  appendOpsFollowUpMetadataLines(lines, opsFields.last, opsFields.architectCheckpoint);
}

function appendMetadataHtml(parts: string[], ctx: RunExportContext): void {
  const { run } = ctx;
  parts.push(
    '<p class="meta-block"><strong>Prompt:</strong> ' +
      formatInlineMarkdown(run.userPrompt) +
      "</p>",
    '<p class="meta-block"><strong>Simulated:</strong> ' +
      escapeHtml(formatExportDate(run.updatedAt)) +
      "</p>",
  );

  if (hasRecordedRunUsage(run.usage)) {
    const cost =
      run.usage.estimatedCostUsd > 0
        ? " · <strong>Est. cost:</strong> $" +
          run.usage.estimatedCostUsd.toFixed(4)
        : "";
    const missingNote =
      run.usage.usageMissing === true
        ? " · <strong>usageMissing:</strong> true"
        : "";
    const peakNote =
      run.usage.peakPromptTokens != null || run.peakPromptTokens != null
        ? " · <strong>Peak prompt:</strong> " +
          (run.usage.peakPromptTokens ?? run.peakPromptTokens)!.toLocaleString()
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
        peakNote +
        missingNote +
        "</p>",
    );
  }

  if (run.debateDurationMs != null || run.artifactDurationMs != null || run.totalDurationMs != null) {
    const partsDuration: string[] = [];
    if (run.debateDurationMs != null) {
      partsDuration.push("debate " + run.debateDurationMs + "ms");
    }
    if (run.artifactDurationMs != null) {
      partsDuration.push("artifacts " + run.artifactDurationMs + "ms");
    }
    if (run.totalDurationMs != null) {
      partsDuration.push("total " + run.totalDurationMs + "ms");
    }
    parts.push(
      '<p class="meta-block"><strong>Duration:</strong> ' +
        escapeHtml(partsDuration.join(" · ")) +
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
    if (run.postApproveTruncation === true) {
      parts.push(
        '<div class="export-warning"><strong>Warning:</strong> postApproveTruncation — reviewer approved but some critical turns were truncated.</div>',
      );
    }
  }

  const synthesisValidation = parseSynthesisValidationFlags(
    run.stackValidationFailed,
    run.crossValidationFailed,
  );
  if (hasSynthesisValidationWarnings(synthesisValidation)) {
    parts.push(
      '<div class="export-warning"><strong>Artifact validation:</strong> ' +
        escapeHtml(synthesisValidationWarningMessage(synthesisValidation)) +
        "</div>",
    );
  }

  const opsFields = resolveRunOpsFollowUpFields(run);
  appendOpsFollowUpMetadataHtml(parts, opsFields.last, opsFields.architectCheckpoint);
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
  const parts: string[] = ["# " + escapeHtml(run.title), ""];

  appendMetadataHtml(parts, ctx);
  parts.push("<hr />", "<h2>Team discussion</h2>");

  for (const message of run.messages) {
    const name = message.agentName ?? message.role;
    const title = message.agentTitle ?? message.role;
    const roleClass = resolveExportMessageRoleClass(message.role);
    const bodyHtml = blocksToHtml(parseMessageBlocks(message.content.trim()));

    parts.push(
      '<div class="message message--' + roleClass + '">',
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
