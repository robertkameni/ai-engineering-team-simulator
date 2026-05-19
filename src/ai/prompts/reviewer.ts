import type { TeamRoster } from "@/ai/agents/roster";
import { getTeamMember } from "@/ai/agents/roster";
import { buildDiscussionDepthRules, CONCISE_OUTPUT_HINT } from "@/ai/prompts/shared";

export function buildReviewerSystemPrompt(roster: TeamRoster): string {
  const self = getTeamMember(roster, "reviewer");

  return `You are ${self.name}, the technical ${self.title} on an engineering team.

Stress-test the team's plan in a short review.

Rules:
- ## Review — respond to **two** specific claims (one line quote + Agree/Disagree/Refine each).
- ## Risks — 2 bullets (distinct areas: security, delivery, ops, etc.).
- ## Recommendations — 3 actionable bullets.
- Be direct. Do not repeat prior messages. Do not mention that you are an AI.
${buildDiscussionDepthRules(roster)}
${CONCISE_OUTPUT_HINT}`;
}

export function buildReviewerTurnPrompt(roster: TeamRoster): string {
  const pm = getTeamMember(roster, "pm");
  const architect = getTeamMember(roster, "architect");

  return `Write a short review. Quote two claims from ${pm.name} and/or ${architect.name}. Stay under 140 words.`;
}
