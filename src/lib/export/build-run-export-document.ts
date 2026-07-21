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

type BoldFormatter = (label: string) => string;

interface MetadataWriter {
  appendPrompt: (prompt: string) => void;
  appendSimulatedDate: (dateLabel: string) => void;
  appendUsage: (value: string) => void;
  appendDuration: (value: string) => void;
  appendDebateOutcome: (params: DebateOutcomeMetadata) => void;
  appendSynthesisValidationWarning: (message: string) => void;
  appendOpsFollowUp: (fields: RunOpsFollowUpExportFields) => void;
  appendFinalization: (summary: string) => void;
}

interface DebateOutcomeMetadata {
  readonly label: string;
  readonly isUnapproved: boolean;
  readonly warningMessage: string;
  readonly hasPostApproveTruncation: boolean;
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
          opsFollowUpOpenIssueCount:
            run.opsFollowUpOpenIssueCount ?? run.opsFollowUpUnresolvedDevopsIssueCount ?? 0,
          opsFollowUpAddressedIssueCount: run.opsFollowUpAddressedIssueCount ?? 0,
          opsFollowUpAcceptedRiskIssueCount:
            run.opsFollowUpAcceptedRiskIssueCount ?? 0,
          opsFollowUpAcceptedRiskReasons: run.opsFollowUpAcceptedRiskReasons ?? [],
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

function buildUsageLineValue(run: MockRun, bold: BoldFormatter): string | null {
  if (!hasRecordedRunUsage(run.usage)) {
    return null;
  }

  const { usage } = run;
  const cost =
    usage.estimatedCostUsd > 0
      ? " · " + bold("Est. cost:") + " $" + usage.estimatedCostUsd.toFixed(4)
      : "";
  const missingNote =
    usage.usageMissing === true ? " · " + bold("usageMissing:") + " true" : "";
  const peakPromptTokens = usage.peakPromptTokens ?? run.peakPromptTokens;
  const peakNote =
    peakPromptTokens != null
      ? " · " + bold("Peak prompt:") + " " + peakPromptTokens.toLocaleString()
      : "";

  return (
    usage.promptTokens.toLocaleString() +
    " prompt · " +
    usage.completionTokens.toLocaleString() +
    " completion · " +
    usage.totalTokens.toLocaleString() +
    " total" +
    cost +
    peakNote +
    missingNote
  );
}

function buildDurationLineValue(run: MockRun): string | null {
  const hasDuration =
    run.debateDurationMs != null ||
    run.artifactDurationMs != null ||
    run.userWaitMs != null ||
    run.totalDurationMs != null;
  if (!hasDuration) {
    return null;
  }

  const parts: string[] = [];
  if (run.debateDurationMs != null) {
    parts.push("debate " + run.debateDurationMs + "ms");
  }
  if (run.artifactDurationMs != null) {
    parts.push("artifacts " + run.artifactDurationMs + "ms");
  }
  if (run.userWaitMs != null) {
    parts.push("userWait " + run.userWaitMs + "ms");
  }
  if (run.totalDurationMs != null) {
    parts.push("total " + run.totalDurationMs + "ms");
  }
  if (run.artifactsPending === true) {
    parts.push("artifactsPending");
  }
  return parts.join(" · ");
}

function buildDebateOutcomeMetadata(run: MockRun): DebateOutcomeMetadata | null {
  if (!run.debateOutcome) {
    return null;
  }

  return {
    label: debateOutcomeLabel(run.debateOutcome),
    isUnapproved: isUnapprovedDebateOutcome(run.debateOutcome),
    warningMessage: debateOutcomeWarningMessage(run.debateOutcome),
    hasPostApproveTruncation: run.postApproveTruncation === true,
  };
}

function buildSynthesisValidationMessage(run: MockRun): string | null {
  const synthesisValidation = parseSynthesisValidationFlags(
    run.stackValidationFailed,
    run.crossValidationFailed,
  );
  if (!hasSynthesisValidationWarnings(synthesisValidation)) {
    return null;
  }
  return synthesisValidationWarningMessage(synthesisValidation);
}

function appendRunMetadata(writer: MetadataWriter, run: MockRun): void {
  writer.appendPrompt(run.userPrompt);
  writer.appendSimulatedDate(formatExportDate(run.updatedAt));

  const usageValue = buildUsageLineValue(run, (label) => "**" + label + "**");
  if (usageValue) {
    writer.appendUsage(usageValue);
  }

  const durationValue = buildDurationLineValue(run);
  if (durationValue) {
    writer.appendDuration(durationValue);
  }

  const debateOutcome = buildDebateOutcomeMetadata(run);
  if (debateOutcome) {
    writer.appendDebateOutcome(debateOutcome);
  }

  const synthesisMessage = buildSynthesisValidationMessage(run);
  if (synthesisMessage) {
    writer.appendSynthesisValidationWarning(synthesisMessage);
  }

  writer.appendOpsFollowUp(resolveRunOpsFollowUpFields(run));

  if (run.finalization) {
    const accepted = run.finalization.acceptedCriticalRisks.length;
    const corrections = Object.entries(run.finalization.correctionsByRole)
      .map(([role, count]) => `${role}:${count}`)
      .join(", ");
    writer.appendFinalization(
      `${run.finalization.reason} · rejects ${run.finalization.rejectCount}` +
        (corrections ? ` · corrections ${corrections}` : "") +
        ` · acceptedCriticalRisks ${accepted}` +
        (run.finalization.outputDiagnostics?.wasNormalized
          ? " · sectionDumpNormalized"
          : ""),
    );
  }
}

function createMarkdownMetadataWriter(lines: string[]): MetadataWriter {
  return {
    appendPrompt: (prompt) => {
      lines.push("**Prompt:** " + prompt, "");
    },
    appendSimulatedDate: (dateLabel) => {
      lines.push("**Simulated:** " + dateLabel, "");
    },
    appendUsage: (value) => {
      lines.push("**Usage:** " + value, "");
    },
    appendDuration: (value) => {
      lines.push("**Duration:** " + value, "");
    },
    appendDebateOutcome: ({ label, isUnapproved, warningMessage, hasPostApproveTruncation }) => {
      if (isUnapproved) {
        lines.push("**Debate outcome:** " + label + " — " + warningMessage, "");
      } else {
        lines.push("**Debate outcome:** " + label, "");
      }
      if (hasPostApproveTruncation) {
        lines.push(
          "**Warning:** postApproveTruncation — reviewer approved but some critical turns were truncated.",
          "",
        );
      }
    },
    appendSynthesisValidationWarning: (message) => {
      lines.push("**Artifact validation:** " + message, "");
    },
    appendOpsFollowUp: (fields) => {
      appendOpsFollowUpMetadataLines(lines, fields.last, fields.architectCheckpoint);
    },
    appendFinalization: (summary) => {
      lines.push("**Finalization:** " + summary, "");
    },
  };
}

function createHtmlMetadataWriter(parts: string[]): MetadataWriter {
  return {
    appendPrompt: (prompt) => {
      parts.push(
        '<p class="meta-block"><strong>Prompt:</strong> ' +
          formatInlineMarkdown(prompt) +
          "</p>",
      );
    },
    appendSimulatedDate: (dateLabel) => {
      parts.push(
        '<p class="meta-block"><strong>Simulated:</strong> ' +
          escapeHtml(dateLabel) +
          "</p>",
      );
    },
    appendUsage: (value) => {
      parts.push(
        '<p class="meta-block"><strong>Usage:</strong> ' +
          value.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>") +
          "</p>",
      );
    },
    appendDuration: (value) => {
      parts.push(
        '<p class="meta-block"><strong>Duration:</strong> ' +
          escapeHtml(value) +
          "</p>",
      );
    },
    appendDebateOutcome: ({ label, isUnapproved, warningMessage, hasPostApproveTruncation }) => {
      const escapedLabel = escapeHtml(label);
      if (isUnapproved) {
        parts.push(
          '<div class="export-warning"><strong>Debate outcome:</strong> ' +
            escapedLabel +
            " — " +
            escapeHtml(warningMessage) +
            "</div>",
        );
      } else {
        parts.push(
          '<p class="meta-block"><strong>Debate outcome:</strong> ' +
            escapedLabel +
            "</p>",
        );
      }
      if (hasPostApproveTruncation) {
        parts.push(
          '<div class="export-warning"><strong>Warning:</strong> postApproveTruncation — reviewer approved but some critical turns were truncated.</div>',
        );
      }
    },
    appendSynthesisValidationWarning: (message) => {
      parts.push(
        '<div class="export-warning"><strong>Artifact validation:</strong> ' +
          escapeHtml(message) +
          "</div>",
      );
    },
    appendOpsFollowUp: (fields) => {
      appendOpsFollowUpMetadataHtml(parts, fields.last, fields.architectCheckpoint);
    },
    appendFinalization: (summary) => {
      parts.push(
        '<p class="meta-block"><strong>Finalization:</strong> ' +
          escapeHtml(summary) +
          "</p>",
      );
    },
  };
}

function appendMetadata(lines: string[], ctx: RunExportContext): void {
  appendRunMetadata(createMarkdownMetadataWriter(lines), ctx.run);
}

function appendMetadataHtml(parts: string[], ctx: RunExportContext): void {
  appendRunMetadata(createHtmlMetadataWriter(parts), ctx.run);
}

function markdownLinesForHeading(block: Extract<MessageBlock, { type: "heading" }>): string[] {
  const prefix = block.level === 2 ? "## " : "### ";
  return [prefix + block.text, ""];
}

function markdownLinesForQuote(block: Extract<MessageBlock, { type: "quote" }>): string[] {
  return [
    "> **" + block.agentName + ":** " + block.text,
    block.verdict ? "> *" + block.verdict + "*" : "",
    "",
  ];
}

function markdownLinesForBlock(block: MessageBlock): string[] {
  if (block.type === "spacer") {
    return [""];
  }
  if (block.type === "heading") {
    return markdownLinesForHeading(block);
  }
  if (block.type === "quote") {
    return markdownLinesForQuote(block);
  }
  if (block.type === "bullet") {
    return ["- " + block.text];
  }
  if (block.type === "emphasis") {
    return ["**" + block.text + "**", ""];
  }
  return [block.text, ""];
}

function blocksToMarkdown(blocks: MessageBlock[]): string[] {
  const lines: string[] = [];
  for (const block of blocks) {
    lines.push(...markdownLinesForBlock(block));
  }
  return lines;
}

function htmlForHeading(block: Extract<MessageBlock, { type: "heading" }>): string {
  const tag = block.level === 2 ? "h2" : "h3";
  return "<" + tag + ">" + escapeHtml(block.text) + "</" + tag + ">";
}

function htmlForQuote(block: Extract<MessageBlock, { type: "quote" }>): string {
  const verdictHtml = block.verdict
    ? "<p><em>" + escapeHtml(block.verdict) + "</em></p>"
    : "";
  return (
    '<blockquote class="export-quote"><cite>' +
    escapeHtml(block.agentName) +
    "</cite>" +
    formatInlineMarkdown(block.text) +
    verdictHtml +
    "</blockquote>"
  );
}

function htmlForEmphasis(block: Extract<MessageBlock, { type: "emphasis" }>): string {
  return "<p><strong>" + escapeHtml(block.text) + "</strong></p>";
}

function htmlForParagraph(block: Extract<MessageBlock, { type: "paragraph" }>): string {
  return "<p>" + formatInlineMarkdown(block.text) + "</p>";
}

function htmlForBullet(block: Extract<MessageBlock, { type: "bullet" }>): string {
  return "<li>" + formatInlineMarkdown(block.text) + "</li>";
}

function blocksToHtml(blocks: MessageBlock[]): string {
  const parts: string[] = [];
  let listOpen = false;

  const closeList = () => {
    if (!listOpen) {
      return;
    }
    parts.push("</ul>");
    listOpen = false;
  };

  const appendNonListBlock = (html: string) => {
    closeList();
    parts.push(html);
  };

  for (const block of blocks) {
    if (block.type === "spacer") {
      closeList();
      continue;
    }
    if (block.type === "heading") {
      appendNonListBlock(htmlForHeading(block));
      continue;
    }
    if (block.type === "quote") {
      appendNonListBlock(htmlForQuote(block));
      continue;
    }
    if (block.type === "bullet") {
      if (!listOpen) {
        parts.push("<ul>");
        listOpen = true;
      }
      parts.push(htmlForBullet(block));
      continue;
    }
    if (block.type === "emphasis") {
      appendNonListBlock(htmlForEmphasis(block));
      continue;
    }
    appendNonListBlock(htmlForParagraph(block));
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
