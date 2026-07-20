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
  readonly opsFollowUpLastCorrectionRole: OpsFollowUpLastCorrectionRole | null;
  readonly opsFollowUpEvaluationTurn: number | null;
}

const CORRECTION_ROLES = new Set<OpsFollowUpLastCorrectionRole>([
  "architect",
  "backend",
  "frontend",
  "devops",
]);

export function parseOpsFollowUpLastCorrectionRole(
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
    opsFollowUpLastCorrectionRole: parseOpsFollowUpLastCorrectionRole(
      record.opsFollowUpLastCorrectionRole,
    ),
    opsFollowUpEvaluationTurn:
      typeof record.opsFollowUpEvaluationTurn === "number"
        ? record.opsFollowUpEvaluationTurn
        : null,
  };
}

export function parseOpsFollowUpArchitectCheckpoint(
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

  return {
    opsFollowUpEvaluated: evaluated,
    opsFollowUpTriggered:
      typeof record.opsFollowUpTriggered === "boolean"
        ? record.opsFollowUpTriggered
        : false,
    opsFollowUpSkipReason:
      typeof record.opsFollowUpSkipReason === "string"
        ? record.opsFollowUpSkipReason
        : record.opsFollowUpSkipReason === null
          ? null
          : null,
    opsFollowUpEligible:
      typeof record.opsFollowUpEligible === "boolean"
        ? record.opsFollowUpEligible
        : false,
    opsFollowUpUnresolvedDevopsIssueCount:
      typeof record.opsFollowUpUnresolvedDevopsIssueCount === "number"
        ? record.opsFollowUpUnresolvedDevopsIssueCount
        : 0,
    opsFollowUpLastCorrectionRole: parseOpsFollowUpLastCorrectionRole(
      record.opsFollowUpLastCorrectionRole,
    ),
    opsFollowUpEvaluationTurn:
      typeof record.opsFollowUpEvaluationTurn === "number"
        ? record.opsFollowUpEvaluationTurn
        : null,
    opsFollowUpArchitectCheckpoint: parseOpsFollowUpArchitectCheckpoint(
      record.opsFollowUpArchitectCheckpoint,
    ),
  };
}

export function buildDefaultOpsFollowUpFields(): OpsFollowUpCheckpoint {
  return {
    opsFollowUpEvaluated: false,
    opsFollowUpTriggered: false,
    opsFollowUpSkipReason: null,
    opsFollowUpEligible: false,
    opsFollowUpUnresolvedDevopsIssueCount: 0,
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
    `**${prefix}last correction role:** ` + correctionRole,
    `**${prefix}evaluation turn:** ` + evaluationTurn,
  );
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
  lines.push(
    `**opsIssuesUnresolved:** ${fields.opsFollowUpUnresolvedDevopsIssueCount}`,
    `**opsIssueResolution:** ${
      fields.opsFollowUpUnresolvedDevopsIssueCount === 0
        ? "resolved"
        : fields.opsFollowUpTriggered
          ? "attempted"
          : "unresolved"
    }`,
  );
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
    `<p class="meta-block"><strong>${prefix}last correction role:</strong> ` +
      correctionRole +
      "</p>",
    `<p class="meta-block"><strong>${prefix}evaluation turn:</strong> ` +
      evaluationTurn +
      "</p>",
  );
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
  parts.push(
    `<p class="meta-block"><strong>opsIssuesUnresolved:</strong> ${fields.opsFollowUpUnresolvedDevopsIssueCount}</p>`,
    `<p class="meta-block"><strong>opsIssueResolution:</strong> ${
      fields.opsFollowUpUnresolvedDevopsIssueCount === 0
        ? "resolved"
        : fields.opsFollowUpTriggered
          ? "attempted"
          : "unresolved"
    }</p>`,
  );

  if (architectCheckpoint) {
    parts.push(
      '<p class="meta-block"><strong>Ops follow-up (architect cycle) evaluated:</strong> yes</p>',
    );
    appendCheckpointHtml(parts, architectCheckpoint, "Ops follow-up (architect cycle) ");
  }
}
