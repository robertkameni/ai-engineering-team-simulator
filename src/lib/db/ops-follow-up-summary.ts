import type { RunSummaryPayload } from "@/lib/db/run-summary.types";

export type OpsFollowUpLastCorrectionRole =
  | "architect"
  | "backend"
  | "frontend"
  | "devops"
  | "unknown";

export interface OpsFollowUpCheckpoint {
  readonly opsFollowUpEvaluated: boolean;
  readonly opsFollowUpTriggered: boolean;
  readonly opsFollowUpSkipReason: string | null;
  readonly opsFollowUpEligible: boolean;
  readonly opsFollowUpUnresolvedDevopsIssueCount: number;
  readonly opsFollowUpOpenIssueCount: number;
  readonly opsFollowUpAddressedIssueCount: number;
  readonly opsFollowUpAcceptedRiskIssueCount: number;
  readonly opsFollowUpAcceptedRiskReasons: readonly string[];
  readonly opsFollowUpLastCorrectionRole: OpsFollowUpLastCorrectionRole | null;
  readonly opsFollowUpEvaluationTurn: number | null;
}

function parseAcceptedRiskReasons(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

const CORRECTION_ROLES = new Set<OpsFollowUpLastCorrectionRole>([
  "architect",
  "backend",
  "frontend",
  "devops",
]);

function parseOpsFollowUpLastCorrectionRole(
  value: unknown,
): OpsFollowUpLastCorrectionRole | null {
  if (typeof value !== "string") {
    return null;
  }
  if (CORRECTION_ROLES.has(value as OpsFollowUpLastCorrectionRole)) {
    return value as OpsFollowUpLastCorrectionRole;
  }
  return value === "unknown" ? "unknown" : null;
}

function parseCheckpointObject(record: Record<string, unknown>): OpsFollowUpCheckpoint {
  return {
    opsFollowUpEvaluated:
      typeof record.opsFollowUpEvaluated === "boolean"
        ? record.opsFollowUpEvaluated
        : false,
    opsFollowUpTriggered:
      typeof record.opsFollowUpTriggered === "boolean"
        ? record.opsFollowUpTriggered
        : false,
    opsFollowUpSkipReason:
      typeof record.opsFollowUpSkipReason === "string"
        ? record.opsFollowUpSkipReason
        : null,
    opsFollowUpEligible:
      typeof record.opsFollowUpEligible === "boolean"
        ? record.opsFollowUpEligible
        : false,
    opsFollowUpUnresolvedDevopsIssueCount:
      typeof record.opsFollowUpUnresolvedDevopsIssueCount === "number"
        ? record.opsFollowUpUnresolvedDevopsIssueCount
        : 0,
    opsFollowUpOpenIssueCount:
      typeof record.opsFollowUpOpenIssueCount === "number"
        ? record.opsFollowUpOpenIssueCount
        : typeof record.opsFollowUpUnresolvedDevopsIssueCount === "number"
          ? record.opsFollowUpUnresolvedDevopsIssueCount
          : 0,
    opsFollowUpAddressedIssueCount:
      typeof record.opsFollowUpAddressedIssueCount === "number"
        ? record.opsFollowUpAddressedIssueCount
        : 0,
    opsFollowUpAcceptedRiskIssueCount:
      typeof record.opsFollowUpAcceptedRiskIssueCount === "number"
        ? record.opsFollowUpAcceptedRiskIssueCount
        : 0,
    opsFollowUpAcceptedRiskReasons: parseAcceptedRiskReasons(
      record.opsFollowUpAcceptedRiskReasons,
    ),
    opsFollowUpLastCorrectionRole: parseOpsFollowUpLastCorrectionRole(
      record.opsFollowUpLastCorrectionRole,
    ),
    opsFollowUpEvaluationTurn:
      typeof record.opsFollowUpEvaluationTurn === "number"
        ? record.opsFollowUpEvaluationTurn
        : null,
  };
}

function parseOpsFollowUpArchitectCheckpoint(
  value: unknown,
): OpsFollowUpCheckpoint | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return parseCheckpointObject(value as Record<string, unknown>);
}

export function parseOpsFollowUpFields(
  record: Record<string, unknown>,
): Pick<
  RunSummaryPayload,
  | "opsFollowUpEvaluated"
  | "opsFollowUpTriggered"
  | "opsFollowUpSkipReason"
  | "opsFollowUpEligible"
  | "opsFollowUpUnresolvedDevopsIssueCount"
  | "opsFollowUpOpenIssueCount"
  | "opsFollowUpAddressedIssueCount"
  | "opsFollowUpAcceptedRiskIssueCount"
  | "opsFollowUpAcceptedRiskReasons"
  | "opsFollowUpLastCorrectionRole"
  | "opsFollowUpEvaluationTurn"
  | "opsFollowUpArchitectCheckpoint"
> {
  const legacyTriggered =
    typeof record.opsFollowUpTriggered === "boolean"
      ? record.opsFollowUpTriggered
      : undefined;

  const evaluated =
    typeof record.opsFollowUpEvaluated === "boolean"
      ? record.opsFollowUpEvaluated
      : legacyTriggered === true;

  const checkpoint = parseCheckpointObject({
    ...record,
    opsFollowUpEvaluated: evaluated,
  });

  return {
    ...checkpoint,
    opsFollowUpArchitectCheckpoint: parseOpsFollowUpArchitectCheckpoint(
      record.opsFollowUpArchitectCheckpoint,
    ),
  };
}

function buildDefaultOpsFollowUpFields(): OpsFollowUpCheckpoint {
  return {
    opsFollowUpEvaluated: false,
    opsFollowUpTriggered: false,
    opsFollowUpSkipReason: null,
    opsFollowUpEligible: false,
    opsFollowUpUnresolvedDevopsIssueCount: 0,
    opsFollowUpOpenIssueCount: 0,
    opsFollowUpAddressedIssueCount: 0,
    opsFollowUpAcceptedRiskIssueCount: 0,
    opsFollowUpAcceptedRiskReasons: [],
    opsFollowUpLastCorrectionRole: null,
    opsFollowUpEvaluationTurn: null,
  };
}

export function opsFollowUpFieldsFromCheckpoint(
  checkpoint: OpsFollowUpCheckpoint | null,
): OpsFollowUpCheckpoint {
  if (!checkpoint) {
    return buildDefaultOpsFollowUpFields();
  }
  return checkpoint;
}

function appendCheckpointLines(
  lines: string[],
  fields: OpsFollowUpCheckpoint,
  prefix: string,
): void {
  const skipReason = fields.opsFollowUpSkipReason ?? "none";
  const correctionRole = fields.opsFollowUpLastCorrectionRole ?? "none";
  const evaluationTurn =
    fields.opsFollowUpEvaluationTurn === null
      ? "none"
      : String(fields.opsFollowUpEvaluationTurn);

  lines.push(
    `**${prefix}eligible:** ` + (fields.opsFollowUpEligible ? "yes" : "no"),
    `**${prefix}triggered:** ` + (fields.opsFollowUpTriggered ? "yes" : "no"),
    `**${prefix}skip reason:** ` + skipReason,
    `**${prefix}unresolved DevOps issues:** ` +
    String(fields.opsFollowUpUnresolvedDevopsIssueCount),
    `**${prefix}open DevOps issues:** ` + String(fields.opsFollowUpOpenIssueCount),
    `**${prefix}addressed DevOps issues:** ` +
    String(fields.opsFollowUpAddressedIssueCount),
    `**${prefix}accepted-risk DevOps issues:** ` +
    String(fields.opsFollowUpAcceptedRiskIssueCount),
    `**${prefix}last correction role:** ` + correctionRole,
    `**${prefix}evaluation turn:** ` + evaluationTurn,
  );
  if (fields.opsFollowUpAcceptedRiskReasons.length > 0) {
    lines.push(
      `**${prefix}accepted-risk reasons:** ` +
      fields.opsFollowUpAcceptedRiskReasons.join(" | "),
    );
  }
}

function resolveOpsIssueResolutionLabel(fields: OpsFollowUpCheckpoint): string {
  if (fields.opsFollowUpOpenIssueCount === 0) {
    return "resolved";
  }
  return fields.opsFollowUpTriggered ? "in_progress" : "unresolved";
}

function appendOpsIssueMetricLines(
  lines: string[],
  fields: OpsFollowUpCheckpoint,
): void {
  lines.push(
    `**opsIssuesUnresolved:** ${fields.opsFollowUpUnresolvedDevopsIssueCount}`,
    `**opsIssuesOpen:** ${fields.opsFollowUpOpenIssueCount}`,
    `**opsIssuesAddressed:** ${fields.opsFollowUpAddressedIssueCount}`,
    `**opsIssuesAcceptedRisk:** ${fields.opsFollowUpAcceptedRiskIssueCount}`,
    `**opsIssueResolution:** ${resolveOpsIssueResolutionLabel(fields)}`,
  );
  if (fields.opsFollowUpAcceptedRiskReasons.length > 0) {
    lines.push(
      `**opsAcceptedRiskReasons:** ${fields.opsFollowUpAcceptedRiskReasons.join(" | ")}`,
    );
  }
}

function appendOpsIssueMetricHtml(
  parts: string[],
  fields: OpsFollowUpCheckpoint,
): void {
  parts.push(
    `<p class="meta-block"><strong>opsIssuesUnresolved:</strong> ${fields.opsFollowUpUnresolvedDevopsIssueCount}</p>`,
    `<p class="meta-block"><strong>opsIssuesOpen:</strong> ${fields.opsFollowUpOpenIssueCount}</p>`,
    `<p class="meta-block"><strong>opsIssuesAddressed:</strong> ${fields.opsFollowUpAddressedIssueCount}</p>`,
    `<p class="meta-block"><strong>opsIssuesAcceptedRisk:</strong> ${fields.opsFollowUpAcceptedRiskIssueCount}</p>`,
    `<p class="meta-block"><strong>opsIssueResolution:</strong> ${resolveOpsIssueResolutionLabel(fields)}</p>`,
  );
  if (fields.opsFollowUpAcceptedRiskReasons.length > 0) {
    parts.push(
      `<p class="meta-block"><strong>opsAcceptedRiskReasons:</strong> ${fields.opsFollowUpAcceptedRiskReasons.join(" | ")}</p>`,
    );
  }
}

export function appendOpsFollowUpMetadataLines(
  lines: string[],
  fields: OpsFollowUpCheckpoint,
  architectCheckpoint?: OpsFollowUpCheckpoint | null,
): void {
  if (!fields.opsFollowUpEvaluated) {
    lines.push("**Ops follow-up:** not evaluated", "");
    return;
  }

  lines.push("**Ops follow-up evaluated:** yes");
  appendCheckpointLines(lines, fields, "Ops follow-up ");
  appendOpsIssueMetricLines(lines, fields);
  lines.push("");

  if (architectCheckpoint) {
    lines.push("**Ops follow-up (architect cycle) evaluated:** yes");
    appendCheckpointLines(lines, architectCheckpoint, "Ops follow-up (architect cycle) ");
    lines.push("");
  }
}

function appendCheckpointHtml(
  parts: string[],
  fields: OpsFollowUpCheckpoint,
  prefix: string,
): void {
  const skipReason = fields.opsFollowUpSkipReason ?? "none";
  const correctionRole = fields.opsFollowUpLastCorrectionRole ?? "none";
  const evaluationTurn =
    fields.opsFollowUpEvaluationTurn === null
      ? "none"
      : String(fields.opsFollowUpEvaluationTurn);

  parts.push(
    `<p class="meta-block"><strong>${prefix}eligible:</strong> ` +
    (fields.opsFollowUpEligible ? "yes" : "no") +
    "</p>",
    `<p class="meta-block"><strong>${prefix}triggered:</strong> ` +
    (fields.opsFollowUpTriggered ? "yes" : "no") +
    "</p>",
    `<p class="meta-block"><strong>${prefix}skip reason:</strong> ` +
    skipReason +
    "</p>",
    `<p class="meta-block"><strong>${prefix}unresolved DevOps issues:</strong> ` +
    String(fields.opsFollowUpUnresolvedDevopsIssueCount) +
    "</p>",
    `<p class="meta-block"><strong>${prefix}open DevOps issues:</strong> ` +
    String(fields.opsFollowUpOpenIssueCount) +
    "</p>",
    `<p class="meta-block"><strong>${prefix}addressed DevOps issues:</strong> ` +
    String(fields.opsFollowUpAddressedIssueCount) +
    "</p>",
    `<p class="meta-block"><strong>${prefix}accepted-risk DevOps issues:</strong> ` +
    String(fields.opsFollowUpAcceptedRiskIssueCount) +
    "</p>",
    `<p class="meta-block"><strong>${prefix}last correction role:</strong> ` +
    correctionRole +
    "</p>",
    `<p class="meta-block"><strong>${prefix}evaluation turn:</strong> ` +
    evaluationTurn +
    "</p>",
  );
  if (fields.opsFollowUpAcceptedRiskReasons.length > 0) {
    parts.push(
      `<p class="meta-block"><strong>${prefix}accepted-risk reasons:</strong> ` +
      fields.opsFollowUpAcceptedRiskReasons.join(" | ") +
      "</p>",
    );
  }
}

export function appendOpsFollowUpMetadataHtml(
  parts: string[],
  fields: OpsFollowUpCheckpoint,
  architectCheckpoint?: OpsFollowUpCheckpoint | null,
): void {
  if (!fields.opsFollowUpEvaluated) {
    parts.push(
      '<p class="meta-block"><strong>Ops follow-up:</strong> not evaluated</p>',
    );
    return;
  }

  parts.push(
    '<p class="meta-block"><strong>Ops follow-up evaluated:</strong> yes</p>',
  );
  appendCheckpointHtml(parts, fields, "Ops follow-up ");
  appendOpsIssueMetricHtml(parts, fields);

  if (architectCheckpoint) {
    parts.push(
      '<p class="meta-block"><strong>Ops follow-up (architect cycle) evaluated:</strong> yes</p>',
    );
    appendCheckpointHtml(parts, architectCheckpoint, "Ops follow-up (architect cycle) ");
  }
}
