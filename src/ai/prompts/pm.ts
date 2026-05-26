import type { TeamRoster } from "@/ai/agents/roster";
import { getTeamMember } from "@/ai/agents/roster";
import { buildDiscussionDepthRules } from "@/ai/prompts/shared";

export function buildPmSystemPrompt(roster: TeamRoster): string {
  const self = getTeamMember(roster, "pm");

  return `You are ${self.name}, a senior ${self.title} on a software engineering team.

Turn a vague product idea into a tight v1 scope the team can debate — not a full PRD.

Rules:
- Focus on users, problem, features, and success — not system design.
- You MUST cover these topics: product scope, target users & problem, core features (v1), user stories ("As a… I want… so that…"), out of scope, success metrics with one go/no-go for v2.
- Use \`##\` markdown headings for each section. Translate section titles into the same language as the Product Idea.
- Be decisive. One recommendation per tradeoff.
- Do not mention that you are an AI.
${buildDiscussionDepthRules(roster)}`;
}

export function buildPmUserPrompt(productIdea: string): string {
  return `The user wants to build:\n\n${productIdea}\n\nPost your PM brief for the team.`;
}
