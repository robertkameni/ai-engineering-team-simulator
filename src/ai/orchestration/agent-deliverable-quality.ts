import type { TeamTemplateId } from "@/ai/agents/team-templates";

const SOFTWARE_ARCHITECT_MIN_CHARS = 800;
const SOFTWARE_ARCHITECT_MIN_HEADINGS = 3;
const PHYSICAL_ARCHITECT_MIN_CHARS = 180;
const PHYSICAL_ARCHITECT_MIN_HEADINGS = 2;

function countMarkdownSectionHeadings(text: string): number {
  return (text.match(/^##\s+/gm) ?? []).length;
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

  if (longEnough && enoughHeadings) {
    return false;
  }

  if (headings < SOFTWARE_ARCHITECT_MIN_HEADINGS) {
    return true;
  }

  if (trimmed.length < SOFTWARE_ARCHITECT_MIN_CHARS) {
    return true;
  }

  return false;
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

const FRONTEND_RISKS_HEADING = /^##\s+.*(?:Frontend Risks|Risques frontend|Risques FE)/im;

export function isFrontendDeliverableInsufficient(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 200) {
    return true;
  }

  if (!FRONTEND_RISKS_HEADING.test(trimmed)) {
    return true;
  }

  const lastLine = trimmed.split("\n").pop()?.trim() ?? "";
  if (/^-\s+(?:Internal|Props|State|Renders|Uses|Handles)\.?$/i.test(lastLine)) {
    return true;
  }

  return false;
}

export function buildFrontendInsufficientContinuationPrompt(): string {
  return `CRITICAL — Your frontend plan was cut off or is missing ## Frontend Risks.

Continue from where you stopped. Finish any incomplete component entry, then add ## Frontend Risks with CLS, race conditions, hydration mismatch, and accessibility mitigations. End with a complete sentence. Do not repeat sections already complete.`;
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

**Disagree** — architecture deliverable incomplete. Your post must include all mandatory \`##\` sections (Architecture, Data Model, APIs & Integration, Decisions & Risks) with production-grade depth, concrete stack choices, and trade-offs. Tool checks alone are not sufficient.

Excerpt:
"""
${excerpt}${tail}
"""`;
}
