import {
  SIMULATION_AGENT_ORDER,
  type SimulationAgentRole,
} from "@/ai/agents/config";
import { getTeamMember, type TeamRoster } from "@/ai/agents/roster";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { hasFrontendRisksSection } from "@/ai/orchestration/looks-like-truncated-agent-output";

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

export function buildReviewerPreflightChecklist(
  transcript: TranscriptEntry[],
  roster: TeamRoster,
  options?: { isReReview?: boolean },
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
  const frontendRisksLine = frontendEntry
    ? hasFrontendRisksSection(frontendEntry.content)
      ? "- Frontend Risks section: present"
      : "- Frontend Risks section: **missing or incomplete** — prefer [REJECT: frontend] until complete"
    : "- Frontend Risks section: **missing** — frontend has not spoken";

  const pipelineComplete = missingRoles.length === 0;

  const reviewGuidance = options?.isReReview
    ? "RE-REVIEW: The corrected agent just spoke. If they addressed your prior objections with concrete changes, issue [APPROVE] on the last line alone. Reject only when a named concern is still missing from their latest message. Do not claim all gaps are resolved while any named objection remains open."
    : "FIRST-PASS REVIEW: Apply your ZERO-APPROVE DEFAULT — reject the single most severe unresolved gap unless every mitigation already appears in a teammate's prior message (not your own review). End with [APPROVE] or [REJECT: role] alone on the absolute last line.";

  return [
    "## Debate pre-flight checklist (server-computed)",
    "",
    reviewGuidance,
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
    "### Operational signals (keyword scan)",
    ...operationalLines,
    "",
    `Turns so far: ${transcript.length}. Pipeline order: ${SIMULATION_AGENT_ORDER.join(" → ")}.`,
  ].join("\n");
}
