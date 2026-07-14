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

export function appendOpsFollowUpMetadataLines(
  lines: string[],
  fields: OpsFollowUpCheckpoint,
): void {
  if (!fields.opsFollowUpEvaluated) {
    lines.push("**Ops follow-up:** not evaluated", "");
    return;
  }

  const skipReason = fields.opsFollowUpSkipReason ?? "none";
  const correctionRole = fields.opsFollowUpLastCorrectionRole ?? "none";
  const evaluationTurn =
    fields.opsFollowUpEvaluationTurn === null
      ? "none"
      : String(fields.opsFollowUpEvaluationTurn);

  lines.push(
    "**Ops follow-up evaluated:** yes",
    "**Ops follow-up eligible:** " + (fields.opsFollowUpEligible ? "yes" : "no"),
    "**Ops follow-up triggered:** " + (fields.opsFollowUpTriggered ? "yes" : "no"),
    "**Ops follow-up skip reason:** " + skipReason,
    "**Ops follow-up unresolved DevOps issues:** " +
      String(fields.opsFollowUpUnresolvedDevopsIssueCount),
    "**Ops follow-up last correction role:** " + correctionRole,
    "**Ops follow-up evaluation turn:** " + evaluationTurn,
    "",
  );
}

export function appendOpsFollowUpMetadataHtml(
  parts: string[],
  fields: OpsFollowUpCheckpoint,
): void {
  if (!fields.opsFollowUpEvaluated) {
    parts.push(
      '<p class="meta-block"><strong>Ops follow-up:</strong> not evaluated</p>',
    );
    return;
  }

  const skipReason = fields.opsFollowUpSkipReason ?? "none";
  const correctionRole = fields.opsFollowUpLastCorrectionRole ?? "none";
  const evaluationTurn =
    fields.opsFollowUpEvaluationTurn === null
      ? "none"
      : String(fields.opsFollowUpEvaluationTurn);

  parts.push(
    '<p class="meta-block"><strong>Ops follow-up evaluated:</strong> yes</p>',
    '<p class="meta-block"><strong>Ops follow-up eligible:</strong> ' +
      (fields.opsFollowUpEligible ? "yes" : "no") +
      "</p>",
    '<p class="meta-block"><strong>Ops follow-up triggered:</strong> ' +
      (fields.opsFollowUpTriggered ? "yes" : "no") +
      "</p>",
    '<p class="meta-block"><strong>Ops follow-up skip reason:</strong> ' +
      skipReason +
      "</p>",
    '<p class="meta-block"><strong>Ops follow-up unresolved DevOps issues:</strong> ' +
      String(fields.opsFollowUpUnresolvedDevopsIssueCount) +
      "</p>",
    '<p class="meta-block"><strong>Ops follow-up last correction role:</strong> ' +
      correctionRole +
      "</p>",
    '<p class="meta-block"><strong>Ops follow-up evaluation turn:</strong> ' +
      evaluationTurn +
      "</p>",
  );
}
