import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamTemplateId } from "@/ai/agents/team-templates";

import { hasCompleteSentenceEnding } from "@/ai/orchestration/agent-output-completion";

const SOFTWARE_ARCHITECT_MIN_CHARS = 800;
const SOFTWARE_ARCHITECT_MIN_HEADINGS = 3;
const PHYSICAL_ARCHITECT_MIN_CHARS = 180;
const PHYSICAL_ARCHITECT_MIN_HEADINGS = 2;
const PM_MIN_HEADINGS = 3;
const BACKEND_MIN_ENDPOINTS = 4;

const OUT_OF_SCOPE_HEADING = /^##\s+.*out of scope/im;
const BACKEND_STACK_HEADING = /^##\s+.*stack/im;
const BACKEND_DATA_APIS_HEADING = /^##\s+.*data\s*&?\s*apis/im;
const BACKEND_RISKS_HEADING = /^##\s+.*backend risks/im;
const BACKEND_ENDPOINT_HEADING = /\*\*Endpoint\s+\d+:/gi;
const DEVOPS_MONITORING_HEADING = /^##\s+.*monitoring/im;
const DEVOPS_RISKS_HEADING = /^##\s+.*risks/im;

function countMarkdownSectionHeadings(text: string): number {
  return (text.match(/^##\s+/gm) ?? []).length;
}

export function isPmDeliverableInsufficient(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || countMarkdownSectionHeadings(trimmed) < PM_MIN_HEADINGS) {
    return true;
  }
  return !OUT_OF_SCOPE_HEADING.test(trimmed);
}

export function isBackendDeliverableInsufficient(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 200) {
    return true;
  }
  if (!BACKEND_STACK_HEADING.test(trimmed)) {
    return true;
  }
  if (!BACKEND_DATA_APIS_HEADING.test(trimmed)) {
    return true;
  }
  if (!BACKEND_RISKS_HEADING.test(trimmed)) {
    return true;
  }

  const endpointCount = (trimmed.match(BACKEND_ENDPOINT_HEADING) ?? []).length;
  if (endpointCount < BACKEND_MIN_ENDPOINTS) {
    return true;
  }

  return !hasCompleteSentenceEnding(trimmed);
}

export function isDevOpsDeliverableInsufficient(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 200) {
    return true;
  }
  if (!DEVOPS_MONITORING_HEADING.test(trimmed)) {
    return true;
  }
  if (!DEVOPS_RISKS_HEADING.test(trimmed)) {
    return true;
  }
  return !/\bbackup\b/i.test(trimmed);
}

export function isRoleDeliverableInsufficient(
  role: SimulationAgentRole,
  text: string,
  templateId: TeamTemplateId,
): boolean {
  if (role === "pm") {
    return isPmDeliverableInsufficient(text);
  }
  if (role === "backend") {
    return isBackendDeliverableInsufficient(text);
  }
  if (role === "devops") {
    return isDevOpsDeliverableInsufficient(text);
  }
  if (role === "frontend") {
    return isFrontendDeliverableInsufficient(text, templateId);
  }
  if (role === "architect") {
    return isArchitectDeliverableInsufficient(text, templateId);
  }
  return false;
}

export function buildPmInsufficientContinuationPrompt(): string {
  return `CRITICAL — Your PM brief is incomplete. Include all mandatory ## sections (scope, users, core features, user stories, out of scope, success metrics) and end with a complete sentence. Do not repeat completed sections.`;
}

export function buildBackendInsufficientContinuationPrompt(): string {
  return `CRITICAL — Your backend plan is incomplete. Finish ## Stack & Layout and ## Data & APIs with at least four **Endpoint N:** blocks (create, complete task, upload document, list active onboardings), then complete ## Backend Risks with named bottlenecks and mitigations. End with a complete sentence.`;
}

export function buildArchitectInsufficientContinuationPrompt(): string {
  return `CRITICAL — Your architecture deliverable is incomplete. Finish all mandatory ## sections (Summary, Decisions ≤5, Risks ≤3) and end the final paragraph with a complete sentence. Do not repeat completed sections.`;
}

export function buildDevOpsInsufficientContinuationPrompt(): string {
  return `CRITICAL — Your DevOps plan is incomplete. Complete ## Monitoring & Rollback, ## Automated Backup (with schedule, storage, restore steps), and ## Risks. End with a complete sentence.`;
}

export function buildRoleInsufficientContinuationPrompt(
  role: SimulationAgentRole,
): string | null {
  if (role === "pm") {
    return buildPmInsufficientContinuationPrompt();
  }
  if (role === "backend") {
    return buildBackendInsufficientContinuationPrompt();
  }
  if (role === "devops") {
    return buildDevOpsInsufficientContinuationPrompt();
  }
  if (role === "frontend") {
    return buildFrontendInsufficientContinuationPrompt();
  }
  if (role === "architect") {
    return buildArchitectInsufficientContinuationPrompt();
  }
  return null;
}

/** Software/hybrid architect must ship multi-section architecture, not tool preamble only. */
export function isSoftwareArchitectDeliverableInsufficient(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }

  const headings = countMarkdownSectionHeadings(trimmed);
  const longEnough = trimmed.length >= SOFTWARE_ARCHITECT_MIN_CHARS;
  const enoughHeadings = headings >= SOFTWARE_ARCHITECT_MIN_HEADINGS;
  const completeEnding = hasCompleteSentenceEnding(trimmed);

  if (longEnough && enoughHeadings && completeEnding) {
    return false;
  }

  if (headings < SOFTWARE_ARCHITECT_MIN_HEADINGS) {
    return true;
  }

  if (trimmed.length < SOFTWARE_ARCHITECT_MIN_CHARS) {
    return true;
  }

  return !completeEnding;
}

function isPhysicalArchitectDeliverableInsufficient(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }
  return (
    trimmed.length < PHYSICAL_ARCHITECT_MIN_CHARS ||
    countMarkdownSectionHeadings(trimmed) < PHYSICAL_ARCHITECT_MIN_HEADINGS
  );
}

export function isArchitectDeliverableInsufficient(
  text: string,
  templateId: TeamTemplateId,
): boolean {
  if (templateId === "physical") {
    return isPhysicalArchitectDeliverableInsufficient(text);
  }
  return isSoftwareArchitectDeliverableInsufficient(text);
}

import { hasFrontendRisksSection } from "@/ai/orchestration/looks-like-truncated-agent-output";

export function isFrontendDeliverableInsufficient(
  text: string,
  templateId: TeamTemplateId = "software",
): boolean {
  if (templateId === "physical") {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 120) {
      return true;
    }
    return !hasCompleteSentenceEnding(trimmed);
  }

  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 200) {
    return true;
  }

  if (!hasFrontendRisksSection(trimmed)) {
    return true;
  }

  if (!hasCompleteSentenceEnding(trimmed)) {
    return true;
  }

  const lastLine = trimmed.split("\n").pop()?.trim() ?? "";
  if (/^-\s+(?:Internal|Props|State|Renders|Uses|Handles)\.?$/i.test(lastLine)) {
    return true;
  }

  return false;
}

export function buildFrontendInsufficientContinuationPrompt(): string {
  return `CRITICAL — Your frontend plan was cut off or is missing ## Frontend Risks / ## Frontend Readiness.

Continue from where you stopped. Do not repeat completed sections. Finish any incomplete component entry, then add ## Frontend Risks with at least three concrete domain-specific risks and mitigations (CLS, race conditions, hydration mismatch, accessibility). End with ## Frontend Readiness confirming the plan is implementable, then a complete sentence.`;
}

export function buildArchitectInsufficientReviewerFeedback(
  architectExcerpt: string,
  templateId: TeamTemplateId,
): string {
  const excerpt = architectExcerpt.trim().slice(0, 500);
  const tail = architectExcerpt.length > 500 ? "…" : "";

  if (templateId === "physical") {
    return `## Revue qualité

**Disagree** — livrable technique incomplet. Votre message doit couvrir les sections \`##\` obligatoires (diagnostics site, matériaux & méthodes, phasage, interfaces, décisions & risques) avec des bullets exploitables.

Extrait :
"""
${excerpt}${tail}
"""`;
  }

  return `## Review

**Disagree** — architecture deliverable incomplete. Your post must include all mandatory \`##\` sections (Summary, Decisions ≤5, Risks ≤3) with production-grade depth, concrete stack choices, and trade-offs. Tool checks alone are not sufficient.

Excerpt:
"""
${excerpt}${tail}
"""`;
}
