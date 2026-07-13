import type { TeamRoster } from "@/ai/agents/roster";
import { formatTeammateNames } from "@/ai/agents/roster";

export type DiscussionDepthStyle = "standard" | "compact";

export function buildDiscussionDepthRules(
  roster: TeamRoster,
  style: DiscussionDepthStyle = "standard",
): string {
  const names = formatTeammateNames(roster);
  const wordRange = style === "compact" ? "180–280" : "250–400";
  return `
Discussion depth (required):
- Use semantic \`##\` section headings. Translate titles into the same language as the Product Idea. **No markdown tables**.
- Write dense, production-grade technical prose. Nested bullets are allowed when they improve scannability.
- Target roughly **${wordRange} words** on a standard turn (shorter only when answering a [REJECT] correction). Include concrete metrics, library names, interfaces, failure modes, and acceptance criteria — not high-level platitudes.
- Complete every \`##\` section you open; never stop mid-sentence or mid-list. If a section would exceed your output budget, reduce the number of sections rather than truncating the last one.
- Reference prior speakers by name (${names}) only if they have already posted in this debate. Do not repeat content already covered by teammates unless you are explicitly revising it.
- Do not merely recite your own implementation plan. You MUST identify at least one explicit architectural choice or library selection proposed by a previous teammate, analyze its performance/operational trade-offs, and either optimize it or defend an alternative approach. Name the teammate and the specific choice you are challenging.
- NEVER output meta-commentary about tool usage (e.g., "Let me check...", "Searching for..."). Output only your final response to the team.
- This is a technical specification document for developers and AI agents to implement from, NOT implementation code. **Never output code blocks or code fences** (\`\`\`). Describe schemas, APIs, type signatures, directory structures, and configuration values in structured prose using headings and nested bullet points. Use inline backticks ONLY for single technical terms (e.g., \`DATABASE_URL\`, \`getGroupBalances()\`), never for multi-line code.

Operational completeness (required for any production system):
- Every async write path that spans two stores (e.g., a database table AND a queue) MUST be evaluated for atomicity: what happens on a crash between the two writes? Name the failure mode and the mitigation.
- Every background worker that calls an external rate-limited API MUST specify its yield/throttle strategy: how does it avoid starving real-time requests, and how does it stay within the external API's rate limits?
- Day-2 operations are in scope: automated data backup (not just "document it"), health/liveness signals beyond a ping endpoint, and alerting on silent degradation (e.g., a queue that stops processing without error). If your role touches persistence or infrastructure, address these.
`;
}

export function buildImplementationQuoteHint(roster: TeamRoster): string {
  return `You MUST include at least one claim from ${roster.backend.name} (${roster.backend.title}), ${roster.frontend.name} (${roster.frontend.title}), or ${roster.devops.name} (${roster.devops.title}) if they have spoken.`;
}

const FEEDBACK_EXCERPT_MAX_CHARS = 1400;

export function truncateFeedbackExcerpt(feedback: string): string {
  const trimmed = feedback.trim();
  if (trimmed.length <= FEEDBACK_EXCERPT_MAX_CHARS) {
    return trimmed;
  }
  return `${trimmed.slice(0, FEEDBACK_EXCERPT_MAX_CHARS).trimEnd()}…`;
}
