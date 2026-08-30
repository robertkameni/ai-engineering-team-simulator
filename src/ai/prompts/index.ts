import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { DebateTurnContext } from "@/ai/context/build-messages";
import type { AgentRole } from "@/lib/types";
import { hasPhysicalKeywords } from "@/ai/orchestration/classify-project";
import { truncateFeedbackExcerpt } from "@/ai/prompts/shared";

import {
  buildArchitectSystemPrompt,
  buildArchitectRevisionTurnPrompt,
  buildArchitectTurnPrompt,
} from "@/ai/prompts/architect";
import { buildDeepFocusSkillDirective } from "@/ai/prompts/deep-focus";
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
import { buildFocusedOpsFollowUpPrompt } from "@/ai/orchestration/ops-follow-up";
import {
  buildReviewerSystemPrompt,
  buildReviewerTurnPrompt,
} from "@/ai/prompts/reviewer";

export function buildCorrectionTurnPrompt(
  role: SimulationAgentRole,
  reviewerName: string,
  feedbackExcerpt: string,
  nearCap = false,
  assignedIssues: readonly { readonly issueId: string; readonly excerpt: string; }[] = [],
): string {
  const excerpt = truncateFeedbackExcerpt(feedbackExcerpt, { nearCap });
  const issueBlock =
    assignedIssues.length > 0
      ? assignedIssues
        .map((issue) => `- ${issue.issueId}: ${issue.excerpt}`)
        .join("\n")
      : "- (no tracked issue IDs — address only the reviewer objections below)";

  return `

CRITICAL — ${reviewerName} rejected your previous ${role} proposal. Address ONLY the assigned issue IDs below. Do NOT restate your full prior plan.

Assigned issue IDs:
${issueBlock}

Reviewer feedback:
"""
${excerpt}
"""

This is a CORRECTION turn — ≤150 words, targeted deltas only:
- Address ONLY the quoted issue ID(s). Do not restate your prior turn.
- Start with a "## Changes" section listing only deltas vs your previous message.
- Reference each assigned issue ID explicitly before the fix.
- Prohibit full-plan restatement, section dumps, and unrelated redesign.
- Provide only the corrected section(s).`;
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
  let prompt: string;

  if (shouldRouteHybridComplianceBackend(role, templateId, productIdea)) {
    prompt = buildPhysicalComplianceExpertSystemPrompt(roster);
  } else {
    const resolved = resolvePromptTemplateId(templateId);

    if (resolved === "physical") {
      switch (role) {
        case "pm":
          prompt = buildPhysicalPmSystemPrompt(roster);
          break;
        case "architect":
          prompt = buildPhysicalTechnicalEngineerSystemPrompt(roster);
          break;
        case "backend":
          prompt = buildPhysicalComplianceExpertSystemPrompt(roster);
          break;
        case "frontend":
          prompt = buildPhysicalPlanningBudgetSystemPrompt(roster);
          break;
        case "devops":
          prompt = buildPhysicalDevOpsSystemPrompt(roster);
          break;
        case "reviewer":
          prompt = buildPhysicalReviewerSystemPrompt(roster);
          break;
        default:
          throw new Error(`No system prompt for role: ${role}`);
      }
    } else {
      switch (role) {
        case "pm":
          prompt = buildPmSystemPrompt(roster);
          break;
        case "architect":
          prompt = buildArchitectSystemPrompt(roster);
          break;
        case "backend":
          prompt = buildDeveloperSystemPrompt(roster);
          break;
        case "frontend":
          prompt = buildFrontendDeveloperSystemPrompt(roster);
          break;
        case "devops":
          prompt = buildDevOpsSystemPrompt(roster);
          break;
        case "reviewer":
          prompt = buildReviewerSystemPrompt(roster);
          break;
        default:
          throw new Error(`No system prompt for role: ${role}`);
      }
    }
  }

  return `${prompt}\n${buildDeepFocusSkillDirective()}`;
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
          turnPrompt = buildPhysicalReviewerTurnPrompt(roster, {
            isReReview: debateContext.isReReview,
          });
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
      correction.nearCap === true,
      correction.assignedIssues ?? [],
    );
  }

  const focusedOpsFollowUp = debateContext.focusedOpsFollowUp;
  if (focusedOpsFollowUp && role === "devops") {
    turnPrompt += buildFocusedOpsFollowUpPrompt({
      reviewerName: focusedOpsFollowUp.reviewerName,
      blockers: focusedOpsFollowUp.blockers,
      reviewerFeedback: focusedOpsFollowUp.reviewerFeedback,
      architectCorrectionExcerpt: focusedOpsFollowUp.architectCorrectionExcerpt ?? null,
    });
  }

  return turnPrompt;
}
