import {
  SIMULATION_AGENT_ORDER,
  type SimulationAgentRole,
} from "@/ai/agents/config";
import { getTeamMember, type TeamRoster } from "@/ai/agents/roster";
import type { CorrectionIssueAssignment } from "@/ai/context/build-messages";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { hasFrontendRisksSection } from "@/ai/orchestration/looks-like-truncated-agent-output";
import { buildCritiqueMatrix } from "@/ai/orchestration/peer-criticism-detector";

const PREFLIGHT_PIPELINE_ROLES = [
  "pm",
  "architect",
  "backend",
  "frontend",
  "devops",
] as const satisfies readonly SimulationAgentRole[];

const OPERATIONAL_SIGNAL_PATTERNS = [
  { id: "backup", label: "automated backup / restore", pattern: /\b(backup|restore|snapshot)\b/i },
  { id: "auth_refresh", label: "auth token refresh", pattern: /\b(refresh token|token refresh|interceptor)\b/i },
  { id: "alerting", label: "silent degradation alerting", pattern: /\b(alert|degradation|monitor|observability)\b/i },
  { id: "onboarding", label: "first-run onboarding", pattern: /\b(onboard|first[- ]run|setup flow|time-to-first)\b/i },
] as const;

function countMarkdownSections(content: string): number {
  return (content.match(/^##\s+/gm) ?? []).length;
}

function hasCrossCritiqueSignal(content: string, roster: TeamRoster): boolean {
  const teammateNames = PREFLIGHT_PIPELINE_ROLES.filter((role) => role !== "pm").map(
    (role) => getTeamMember(roster, role).name,
  );
  return teammateNames.some((name) => content.includes(name));
}

/**
 * Full preflight for the initial reviewer pass only. Scoped re-review uses
 * {@link buildScopedReReviewChecklist} instead.
 */
export function buildReviewerPreflightChecklist(
  transcript: TranscriptEntry[],
  roster: TeamRoster,
): string {
  const spokenRoles = new Set(
    transcript.map((entry) => entry.role).filter((role) => role !== "reviewer"),
  );
  const missingRoles = PREFLIGHT_PIPELINE_ROLES.filter((role) => !spokenRoles.has(role));

  const roleLines = PREFLIGHT_PIPELINE_ROLES.map((role) => {
    const member = getTeamMember(roster, role);
    const entry = transcript.findLast((item) => item.role === role);
    if (!entry) {
      return `- ${member.name} (${role}): **missing** — no message in transcript`;
    }

    const sectionCount = countMarkdownSections(entry.content);
    const crossCritique = hasCrossCritiqueSignal(entry.content, roster);
    return `- ${member.name} (${role}): spoke (${entry.content.length} chars, ${sectionCount} ## sections, cross-critique signal: ${crossCritique ? "yes" : "no"})`;
  });

  const combinedTranscript = transcript.map((entry) => entry.content).join("\n");
  const operationalLines = OPERATIONAL_SIGNAL_PATTERNS.map((signal) => {
    const found = signal.pattern.test(combinedTranscript);
    return `- ${signal.label}: ${found ? "mentioned" : "not detected"}`;
  });

  const frontendEntry = transcript.findLast((entry) => entry.role === "frontend");
  // Hard-block Frontend Risks only when Frontend has actually spoken.
  // Otherwise prefer inviting Frontend — never reject a silent role into a correction loop.
  const frontendRisksLine = frontendEntry
    ? hasFrontendRisksSection(frontendEntry.content)
      ? "- Frontend Risks section: present"
      : "- Frontend Risks section: **missing or incomplete** — prefer [REJECT: frontend] until complete"
    : "- Frontend Risks section: not applicable yet — frontend has not spoken (do NOT [REJECT: frontend]; invite Frontend first)";

  const critiqueMatrix = buildCritiqueMatrix(transcript, roster);
  const critiqueLines = critiqueMatrix.map((summary) => {
    if (summary.critiques.length === 0) {
      return `- ${summary.name} (${summary.role}): no verbatim critique detected`;
    }
    const evidence = summary.critiques
      .map(
        (critique) =>
          `challenged ${getTeamMember(roster, critique.targetRole).name} — "${critique.excerpt}"`,
      )
      .join("; ");
    return `- ${summary.name} (${summary.role}): ${evidence}`;
  });

  const pipelineComplete = missingRoles.length === 0;

  return [
    "## Debate pre-flight checklist (server-computed)",
    "",
    "FIRST-PASS REVIEW: Apply your ZERO-APPROVE DEFAULT — reject the single most severe unresolved gap unless every mitigation already appears in a teammate's prior message (not your own review). End with [APPROVE] or [REJECT: role] alone on the absolute last line.",
    "",
    "### Pipeline coverage",
    pipelineComplete
      ? "- All pipeline roles have spoken."
      : `- Missing roles: ${missingRoles.join(", ")}`,
    "",
    "### Role status",
    ...roleLines,
    "",
    "### Frontend closure gate",
    frontendRisksLine,
    "",
    "### Cross-critique matrix (server-computed)",
    "Ground truth for the Cross-Critique Compliance section. Verify these excerpts, do not reconstruct attributions from memory.",
    ...critiqueLines,
    "",
    "### Operational signals (keyword scan)",
    ...operationalLines,
    "",
    `Turns so far: ${transcript.length}. Pipeline order: ${SIMULATION_AGENT_ORDER.join(" → ")}.`,
  ].join("\n");
}

/** Verbatim window of the corrected agent's latest message shown to the re-reviewer. */
const REREVIEW_LATEST_MESSAGE_MAX_CHARS = 6_000;

/**
 * Correction-scoped re-review checklist. Omits full pipeline/ops preflight and
 * asks only whether assigned issue IDs were addressed. Includes the corrected
 * agent's latest message so the re-reviewer can credit fixes that landed in a
 * full re-post (not just the delta correction).
 */
export function buildScopedReReviewChecklist(params: {
  readonly targetRole: SimulationAgentRole | null;
  readonly issues: readonly CorrectionIssueAssignment[];
  readonly roster: TeamRoster;
  readonly targetLatestMessage?: string | null;
}): string {
  const targetLabel = params.targetRole
    ? `${getTeamMember(params.roster, params.targetRole).name} (${params.targetRole})`
    : "the corrected agent";

  const issueLines =
    params.issues.length > 0
      ? params.issues.map((issue) => {
          return `- ${issue.issueId} [${issue.status}]: ${issue.excerpt}`;
        })
      : ["- (no tracked issue IDs — judge only the prior named objections)"];

  const latestMessage = params.targetLatestMessage?.trim();
  const latestMessageBlock = latestMessage
    ? [
        "",
        "### Corrected agent's latest message (verbatim)",
        "This is the corrected agent's most recent full message. It is authoritative: credit an assigned-issue fix found here even if the earlier `## Changes` delta did not mention it.",
        "",
        latestMessage.length > REREVIEW_LATEST_MESSAGE_MAX_CHARS
          ? `${latestMessage.slice(0, REREVIEW_LATEST_MESSAGE_MAX_CHARS).trimEnd()}…[truncated]`
          : latestMessage,
      ]
    : [];

  return [
    "## Scoped re-review checklist (server-computed)",
    "",
    `Evaluate only whether ${targetLabel} addressed the assigned issue IDs below.`,
    "Do NOT reopen the full preflight, invent unrelated blockers, or expand the issue set.",
    "If the corrected agent posted both a delta correction (`## Changes`) and a full revised re-post, judge the LATEST message — it is authoritative.",
    "If every assigned open issue is addressed with concrete changes, emit [APPROVE] alone on the last line.",
    "Reject only when a listed issue ID remains unresolved in the latest message.",
    "",
    "### Assigned issue dispositions",
    ...issueLines,
    ...latestMessageBlock,
  ].join("\n");
}
