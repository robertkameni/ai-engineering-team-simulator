import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { DebateTurnContext } from "@/ai/context/build-messages";
import type { AgentRole } from "@/features/agents/types";
import { hasPhysicalKeywords } from "@/ai/orchestration/classify-project";
import { truncateFeedbackExcerpt } from "@/ai/prompts/shared";

import {
  buildArchitectSystemPrompt,
  buildArchitectRevisionTurnPrompt,
  buildArchitectTurnPrompt,
} from "@/ai/prompts/architect";
import {
  buildDeveloperSystemPrompt,
  buildDeveloperTurnPrompt,
} from "@/ai/prompts/developer";
import {
  buildDevOpsSystemPrompt,
  buildDevOpsTurnPrompt,
} from "@/ai/prompts/devops";
import {
  buildFrontendDeveloperSystemPrompt,
  buildFrontendDeveloperTurnPrompt,
} from "@/ai/prompts/frontend-developer";
import { buildPhysicalComplianceExpertSystemPrompt, buildPhysicalComplianceExpertTurnPrompt } from "@/ai/prompts/physical/compliance-expert";
import {
  buildPhysicalDevOpsSystemPrompt,
  buildPhysicalDevOpsTurnPrompt,
} from "@/ai/prompts/physical/devops-site";
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

function buildCorrectionTurnPrompt(
  role: SimulationAgentRole,
  reviewerName: string,
  feedbackExcerpt: string,
): string {
  const excerpt = truncateFeedbackExcerpt(feedbackExcerpt);
  return `

CRITICAL — ${reviewerName} rejected your previous ${role} proposal. Quote their specific objection below, then address each flagged flaw with concrete revisions to your plan.

Reviewer feedback:
"""
${excerpt}
"""

This is a CORRECTION turn — do NOT repost your full prior plan verbatim.
- Start with a "## Changes" section listing only deltas vs your previous message in the transcript.
- Quote each reviewer objection before your fix.
- Keep cross-critique brief; prioritize resolving flagged flaws.

You must respond point-by-point. Do not ignore their criticism. Re-engage the cross-critique rule only when relevant to a flagged flaw.`;
}

function resolvePromptTemplateId(templateId: TeamTemplateId): "software" | "physical" {
  return templateId === "physical" ? "physical" : "software";
}

function shouldRouteHybridComplianceBackend(
  role: AgentRole,
  templateId: TeamTemplateId,
  productIdea: string,
): boolean {
  return (
    role === "backend" &&
    templateId === "hybrid" &&
    hasPhysicalKeywords(productIdea)
  );
}

export function getAgentSystemPrompt(
  role: AgentRole,
  roster: TeamRoster,
  templateId: TeamTemplateId = roster.templateId,
  productIdea = "",
): string {
  if (shouldRouteHybridComplianceBackend(role, templateId, productIdea)) {
    return buildPhysicalComplianceExpertSystemPrompt(roster);
  }

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
      case "devops":
        return buildPhysicalDevOpsSystemPrompt(roster);
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
    case "devops":
      return buildDevOpsSystemPrompt(roster);
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
  debateContext: DebateTurnContext = {},
): string {
  let turnPrompt: string;

  if (shouldRouteHybridComplianceBackend(role, templateId, productIdea)) {
    turnPrompt = buildPhysicalComplianceExpertTurnPrompt();
  } else {
    const resolved = resolvePromptTemplateId(templateId);

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
        case "devops":
          turnPrompt = buildPhysicalDevOpsTurnPrompt();
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
          turnPrompt = debateContext.architectRevisionCritiques
            ? buildArchitectRevisionTurnPrompt(debateContext.architectRevisionCritiques)
            : buildArchitectTurnPrompt();
          break;
        case "backend":
          turnPrompt = buildDeveloperTurnPrompt();
          break;
        case "frontend":
          turnPrompt = buildFrontendDeveloperTurnPrompt();
          break;
        case "devops":
          turnPrompt = buildDevOpsTurnPrompt();
          break;
        case "reviewer":
          turnPrompt = buildReviewerTurnPrompt(roster, {
            isReReview: debateContext.isReReview,
          });
          break;
        default:
          throw new Error(`No turn prompt for role: ${role}`);
      }
    }
  }

  const correction = debateContext.correction;
  if (correction && role !== "reviewer" && role === correction.targetRole) {
    turnPrompt += buildCorrectionTurnPrompt(
      correction.targetRole,
      correction.reviewerName,
      correction.feedback,
    );
  }

  return turnPrompt;
}
