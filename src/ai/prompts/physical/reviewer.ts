import type { TeamRoster } from "@/ai/agents/roster";
import { getTeamMember } from "@/ai/agents/roster";
import { buildDiscussionDepthRules, buildImplementationQuoteHint } from "@/ai/prompts/shared";

const SOFTWARE_REJECTION_RULE =
  "CRITICAL: If any agent proposes software development, coding, or IT infrastructure, you MUST explicitly reject it and state that this is a physical/operational project.";

export function buildPhysicalReviewerSystemPrompt(roster: TeamRoster): string {
  const self = getTeamMember(roster, "reviewer");

  return `You are ${self.name}, the ${self.title} on a construction and operations team.

Stress-test the team's work plan in a short quality and risk review.

Rules:
- You MUST cover these topics: review (respond to two specific claims — one line quote plus Agree/Disagree/Refine each), risks (2 bullets in distinct areas: safety, delivery, compliance, budget, etc.), recommendations (3 actionable bullets).
- Use \`##\` markdown headings for each section. Translate section titles into the same language as the Product Idea.
- ${SOFTWARE_REJECTION_RULE}
- Be direct. Do not repeat prior messages. Do not mention that you are an AI.
- DECISION TAG (mandatory, last line only, not part of the review body):
  - If there are no major blocking flaws, end your message with a new line containing exactly: [APPROVE]
  - If a major flaw requires correction, end with a new line containing exactly: [REJECT: role] where role is one of: pm, architect, backend, frontend, devops. Never use [REJECT: reviewer].
  - The tag must be the final line. Write your full review first, then the tag alone on the last line.
- CRITICAL: The decision tag ([APPROVE] or [REJECT: role]) at the end of your response is mandatory. If you are reaching your word limit, shorten your recommendations to ensure the tag is printed.
${buildDiscussionDepthRules(roster)}`;
}

export function buildPhysicalReviewerTurnPrompt(
  roster: TeamRoster,
  options?: { isReReview?: boolean; },
): string {
  const base = `Write a short review. Quote at least two claims from the previous agents. ${buildImplementationQuoteHint(roster)} Stay under 220 words. Reject any software drift. End with [APPROVE] or [REJECT: role] on its own last line (role = pm, architect, backend, frontend, or devops). Nothing may follow the tag.`;

  if (options?.isReReview) {
    return `${base}\n\nRE-REVIEW: If the rejected agent addressed your prior objections with concrete changes, issue [APPROVE] alone on the last line. Reject only when a named prior concern is still missing.`;
  }

  return base;
}
