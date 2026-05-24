import type { TeamRoster } from "@/ai/agents/roster";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
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
import { buildPhysicalComplianceExpertSystemPrompt, buildPhysicalComplianceExpertTurnPrompt } from "@/ai/prompts/physical/compliance-expert";
import { buildPhysicalPlanningBudgetSystemPrompt, buildPhysicalPlanningBudgetTurnPrompt } from "@/ai/prompts/physical/planning-budget";
import { buildPhysicalPmSystemPrompt, buildPhysicalPmUserPrompt } from "@/ai/prompts/physical/pm";
import {
  buildPhysicalReviewerSystemPrompt,
  buildPhysicalReviewerTurnPrompt,
} from "@/ai/prompts/physical/reviewer";
import {
  buildPhysicalTechnicalEngineerSystemPrompt,
  buildPhysicalTechnicalEngineerTurnPrompt,
} from "@/ai/prompts/physical/technical-engineer";
import { buildPmSystemPrompt, buildPmUserPrompt } from "@/ai/prompts/pm";
import {
  buildReviewerSystemPrompt,
  buildReviewerTurnPrompt,
} from "@/ai/prompts/reviewer";

function resolvePromptTemplateId(templateId: TeamTemplateId): "software" | "physical" {
  return templateId === "physical" ? "physical" : "software";
}

export function getAgentSystemPrompt(
  role: AgentRole,
  roster: TeamRoster,
  templateId: TeamTemplateId = roster.templateId,
): string {
  const resolved = resolvePromptTemplateId(templateId);

  if (resolved === "physical") {
    switch (role) {
      case "pm":
        return buildPhysicalPmSystemPrompt(roster);
      case "architect":
        return buildPhysicalTechnicalEngineerSystemPrompt(roster);
      case "backend":
        return buildPhysicalComplianceExpertSystemPrompt(roster);
      case "frontend":
        return buildPhysicalPlanningBudgetSystemPrompt(roster);
      case "reviewer":
        return buildPhysicalReviewerSystemPrompt(roster);
      default:
        throw new Error(`No system prompt for role: ${role}`);
    }
  }

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
  templateId: TeamTemplateId = roster.templateId,
): string {
  const resolved = resolvePromptTemplateId(templateId);

  if (resolved === "physical") {
    switch (role) {
      case "pm":
        return buildPhysicalPmUserPrompt(productIdea);
      case "architect":
        return buildPhysicalTechnicalEngineerTurnPrompt();
      case "backend":
        return buildPhysicalComplianceExpertTurnPrompt();
      case "frontend":
        return buildPhysicalPlanningBudgetTurnPrompt();
      case "reviewer":
        return buildPhysicalReviewerTurnPrompt(roster);
      default:
        throw new Error(`No turn prompt for role: ${role}`);
    }
  }

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
