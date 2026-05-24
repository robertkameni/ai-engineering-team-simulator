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

const CORRECTION_TURN_SUFFIX =
  "\n\nCRITICAL: The Reviewer has rejected your previous proposal. You must directly address their criticism, correct the flaws, and provide an updated plan.";

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
  isCorrection?: boolean,
): string {
  const resolved = resolvePromptTemplateId(templateId);
  let turnPrompt: string;

  if (resolved === "physical") {
    switch (role) {
      case "pm":
        turnPrompt = buildPhysicalPmUserPrompt(productIdea);
        break;
      case "architect":
        turnPrompt = buildPhysicalTechnicalEngineerTurnPrompt();
        break;
      case "backend":
        turnPrompt = buildPhysicalComplianceExpertTurnPrompt();
        break;
      case "frontend":
        turnPrompt = buildPhysicalPlanningBudgetTurnPrompt();
        break;
      case "reviewer":
        turnPrompt = buildPhysicalReviewerTurnPrompt(roster);
        break;
      default:
        throw new Error(`No turn prompt for role: ${role}`);
    }
  } else {
    switch (role) {
      case "pm":
        turnPrompt = buildPmUserPrompt(productIdea);
        break;
      case "architect":
        turnPrompt = buildArchitectTurnPrompt();
        break;
      case "backend":
        turnPrompt = buildDeveloperTurnPrompt();
        break;
      case "frontend":
        turnPrompt = buildFrontendDeveloperTurnPrompt();
        break;
      case "reviewer":
        turnPrompt = buildReviewerTurnPrompt(roster);
        break;
      default:
        throw new Error(`No turn prompt for role: ${role}`);
    }
  }

  if (isCorrection && role !== "reviewer") {
    turnPrompt += CORRECTION_TURN_SUFFIX;
  }

  return turnPrompt;
}
