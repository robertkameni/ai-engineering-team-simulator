import type { TeamRoster } from "@/ai/agents/roster";
import type { AgentRole } from "@/features/agents/types";

import {
  buildArchitectSystemPrompt,
  buildArchitectTurnPrompt,
} from "@/ai/prompts/architect";
import {
  buildDeveloperSystemPrompt,
  buildDeveloperTurnPrompt,
} from "@/ai/prompts/developer";
import {
  buildFrontendDeveloperSystemPrompt,
  buildFrontendDeveloperTurnPrompt,
} from "@/ai/prompts/frontend-developer";
import { buildPmSystemPrompt, buildPmUserPrompt } from "@/ai/prompts/pm";
import {
  buildReviewerSystemPrompt,
  buildReviewerTurnPrompt,
} from "@/ai/prompts/reviewer";

export function getAgentSystemPrompt(
  role: AgentRole,
  roster: TeamRoster,
): string {
  switch (role) {
    case "pm":
      return buildPmSystemPrompt(roster);
    case "architect":
      return buildArchitectSystemPrompt(roster);
    case "backend":
      return buildDeveloperSystemPrompt(roster);
    case "frontend":
      return buildFrontendDeveloperSystemPrompt(roster);
    case "reviewer":
      return buildReviewerSystemPrompt(roster);
    default:
      throw new Error(`No system prompt for role: ${role}`);
  }
}

export function getAgentTurnPrompt(
  role: AgentRole,
  productIdea: string,
  roster: TeamRoster,
): string {
  switch (role) {
    case "pm":
      return buildPmUserPrompt(productIdea);
    case "architect":
      return buildArchitectTurnPrompt();
    case "backend":
      return buildDeveloperTurnPrompt();
    case "frontend":
      return buildFrontendDeveloperTurnPrompt();
    case "reviewer":
      return buildReviewerTurnPrompt(roster);
    default:
      throw new Error(`No turn prompt for role: ${role}`);
  }
}
