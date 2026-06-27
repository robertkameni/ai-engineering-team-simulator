import type { TeamTemplateId } from "@/ai/agents/team-templates";

const SOFTWARE_ARCHITECT_MIN_CHARS = 800;
const SOFTWARE_ARCHITECT_MIN_HEADINGS = 3;
const PHYSICAL_ARCHITECT_MIN_CHARS = 180;
const PHYSICAL_ARCHITECT_MIN_HEADINGS = 2;

const ARCHITECT_PREAMBLE_ONLY =
  /(?:vérifier|verifier|verify|check).{0,80}(?:framework|package|npm|version)|(?:before|avant).{0,40}(?:decision|décision)/i;

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

  if (headings < 2 && trimmed.length < SOFTWARE_ARCHITECT_MIN_CHARS) {
    return true;
  }

  if (headings < SOFTWARE_ARCHITECT_MIN_HEADINGS) {
    return true;
  }

  if (trimmed.length < SOFTWARE_ARCHITECT_MIN_CHARS) {
    return true;
  }

  if (headings < SOFTWARE_ARCHITECT_MIN_HEADINGS && ARCHITECT_PREAMBLE_ONLY.test(trimmed)) {
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
