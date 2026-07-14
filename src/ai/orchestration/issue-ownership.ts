import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";

export type IssueSeverity = "blocker" | "concern";

const OPERATIONAL_CATEGORY_PATTERNS: readonly RegExp[] = [
  /\b(backup|restore|pg_restore|disaster recovery|replication|snapshot)\b/i,
  /\b(queue|retry|dlq|dead letter|stalled jobs?|worker|job recovery|pg-boss|bullmq)\b/i,
  /\b(monitor|monitoring|alert|alerting|metrics|observability|synthetic|health check|healthz|slo)\b/i,
  /\b(rate limit|circuit breaker|failover|throttl)\b/i,
  /\b(deploy|deployment|migration order|rollout|rollback|pre-deploy|codedeploy)\b/i,
  /\b(connection pool|contention|runtime hardening)\b/i,
  /\b(smtp|webhook|background process)\b/i,
  /\b(runbook|on-call|ops readiness)\b/i,
];

export function matchesOperationalCategory(text: string): boolean {
  return OPERATIONAL_CATEGORY_PATTERNS.some((pattern) => pattern.test(text));
}

const ROLE_TAG_PATTERN =
  /\*\*(?:\d+\.\s*)?(pm|architect|backend|frontend|devops)\*\*/i;

const ARCHITECT_OWNERSHIP_HINTS =
  /\b(topology|service boundar|architectural|separation of concerns|high-level design|system design|adr|microservice split|schema design)\b/i;

const BACKEND_OWNERSHIP_HINTS =
  /\b(transactional|stale read|outbox poller|claimed_by|query correctness|api semantics|outbox implementation|idempotenc|database constraint|orm|sql\b|endpoint contract|invite acceptance|duplicate post)\b/i;

export function inferIssueSeverity(concern: string): IssueSeverity {
  if (/\bUNRESOLVED\b/i.test(concern) || /\*\*Disagree\*\*/i.test(concern)) {
    return "blocker";
  }
  return "concern";
}

export function inferIssueOwnerFromConcern(
  concern: string,
  roster: TeamRoster,
  rejectRole: SimulationAgentRole,
): SimulationAgentRole {
  const roleTagMatch = concern.match(ROLE_TAG_PATTERN);
  if (roleTagMatch) {
    return roleTagMatch[1]!.toLowerCase() as SimulationAgentRole;
  }

  const lowerConcern = concern.toLowerCase();
  for (const role of ["pm", "architect", "backend", "frontend", "devops"] as const) {
    const memberName = roster[role].name.toLowerCase();
    if (lowerConcern.includes(memberName)) {
      return role;
    }
  }

  if (ARCHITECT_OWNERSHIP_HINTS.test(concern)) {
    return "architect";
  }
  if (BACKEND_OWNERSHIP_HINTS.test(concern)) {
    return "backend";
  }

  if (matchesOperationalCategory(concern)) {
    return "devops";
  }

  return rejectRole;
}

export function isDevOpsOwnedConcern(
  concern: string,
  roster: TeamRoster,
  rejectRole: SimulationAgentRole,
): boolean {
  return inferIssueOwnerFromConcern(concern, roster, rejectRole) === "devops";
}
