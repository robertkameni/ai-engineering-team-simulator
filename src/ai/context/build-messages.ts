import type { ModelMessage } from "ai";

import type { SimulationAgentRole } from "@/ai/agents/config";
import { getTeamMember, type TeamRoster } from "@/ai/agents/roster";
import { buildLanguageMatchDirective } from "@/ai/context/detect-product-language";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { buildSimulationStackReferenceDirective } from "@/ai/context/simulation-stack-reference";
import {
  estimatePromptTokensFromChars,
  isPromptContextOverBudget,
  truncatePromptContentToBudget,
} from "@/ai/context/prompt-context-budget";
import { windowTranscriptForTurn } from "@/ai/context/window-transcript";
import {
  buildReviewerPreflightChecklist,
  buildScopedReReviewChecklist,
} from "@/ai/orchestration/reviewer-preflight";
import type { ReviewIssue } from "@/ai/orchestration/review-issue-tracker";
import { getAgentTurnPrompt } from "@/ai/prompts";
import type { AgentRole } from "@/features/agents/types";

export interface CorrectionIssueAssignment {
  readonly issueId: string;
  readonly excerpt: string;
  readonly status: ReviewIssue["status"];
}

export interface DebateTurnContext {
  correction?: {
    reviewerName: string;
    feedback: string;
    targetRole: SimulationAgentRole;
    nearCap?: boolean;
    assignedIssues?: readonly CorrectionIssueAssignment[];
  };
  focusedOpsFollowUp?: {
    reviewerName: string;
    blockers: readonly string[];
    reviewerFeedback: string;
    architectCorrectionExcerpt?: string | null;
  };
  isReReview?: boolean;
  /** Role whose correction is under scoped re-review. */
  reReviewTargetRole?: SimulationAgentRole;
  /** Open/addressed dispositions for the active reject target on scoped re-review. */
  reReviewIssues?: readonly CorrectionIssueAssignment[];
  hasTeamDisagreement?: boolean;
  architectRevisionCritiques?: string[];
}

function formatProductIdeaBlock(productIdea: string): string {
  return `## Product idea\n\n${productIdea}\n\n${buildLanguageMatchDirective(productIdea)}`;
}

function toCorrectionAssignments(
  issues: readonly ReviewIssue[],
  targetRole: SimulationAgentRole,
): CorrectionIssueAssignment[] {
  return issues
    .filter((issue) => issue.targetRole === targetRole)
    .map((issue) => ({
      issueId: issue.id,
      excerpt: issue.excerpt,
      status: issue.status,
    }));
}

export function resolveDebateTurnContext(
  role: SimulationAgentRole,
  transcript: TranscriptEntry[],
  roster: TeamRoster,
  lastRejectTarget: SimulationAgentRole | null,
  lastRejectFeedback: string | null,
  options?: {
    readonly nearCapCorrection?: boolean;
    readonly reviewIssues?: readonly ReviewIssue[];
  },
): DebateTurnContext {
  const reviewerName = getTeamMember(roster, "reviewer").name;
  const reviewIssues = options?.reviewIssues ?? [];

  if (
    role === lastRejectTarget &&
    lastRejectFeedback &&
    transcript.length > 0 &&
    transcript[transcript.length - 1]?.role === "reviewer"
  ) {
    return {
      correction: {
        reviewerName,
        feedback: lastRejectFeedback,
        targetRole: role,
        nearCap: options?.nearCapCorrection === true,
        assignedIssues: toCorrectionAssignments(reviewIssues, role).filter(
          (issue) => issue.status === "open",
        ),
      },
    };
  }

  if (
    role === "reviewer" &&
    lastRejectTarget &&
    lastRejectFeedback &&
    transcript.length > 0 &&
    transcript[transcript.length - 1]?.role === lastRejectTarget
  ) {
    return {
      isReReview: true,
      reReviewTargetRole: lastRejectTarget,
      reReviewIssues: toCorrectionAssignments(reviewIssues, lastRejectTarget),
    };
  }

  return {};
}

const STACK_REFERENCE_ROLES = new Set<SimulationAgentRole>([
  "architect",
  "backend",
  "frontend",
  "devops",
]);

function applyPromptContextBudget(messages: ModelMessage[]): {
  readonly messages: ModelMessage[];
  readonly contextBudgetExceeded: boolean;
} {
  const totalChars = messages.reduce((sum, message) => {
    return (
      sum + (typeof message.content === "string" ? message.content.length : 0)
    );
  }, 0);

  if (
    !isPromptContextOverBudget({
      charCount: totalChars,
      promptTokens: estimatePromptTokensFromChars(totalChars),
    })
  ) {
    return { messages, contextBudgetExceeded: false };
  }

  console.warn("PROMPT CONTEXT BUDGET: truncating assembled messages", {
    totalChars,
    estimatedTokens: estimatePromptTokensFromChars(totalChars),
  });

  const truncated: ModelMessage[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!;
    if (typeof message.content !== "string" || index === messages.length - 1) {
      truncated.push(message);
      continue;
    }
    const result = truncatePromptContentToBudget(message.content);
    if (!result.wasTruncated) {
      truncated.push(message);
      continue;
    }
    // Rebuild string-content messages explicitly — spreading a tool message
    // would widen content to string and fail ModelMessage assignability.
    truncated.push({
      role: message.role as "system" | "user" | "assistant",
      content: result.content,
    });
  }

  return { messages: truncated, contextBudgetExceeded: true };
}

export function buildAgentMessages(
  role: AgentRole,
  productIdea: string,
  transcript: TranscriptEntry[],
  roster: TeamRoster,
  debateContext: DebateTurnContext = {},
): ModelMessage[] {
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: formatProductIdeaBlock(productIdea),
    },
  ];

  if (STACK_REFERENCE_ROLES.has(role)) {
    messages.push({
      role: "user",
      content: buildSimulationStackReferenceDirective(),
    });
  }

  const windowedTranscript = windowTranscriptForTurn(
    transcript,
    roster,
    debateContext,
  );

  if (windowedTranscript.omittedSummary) {
    messages.push({
      role: "user",
      content: windowedTranscript.omittedSummary,
    });
  }

  for (const entry of windowedTranscript.entries) {
    const teammateTitle = getTeamMember(roster, entry.role).title;
    messages.push({
      role: "user",
      content: `[MESSAGE FROM TEAMMATE ${entry.agentName} (${teammateTitle})]:\n\n${formatTranscriptMessage(entry)}`,
    });
  }

  if (role === "reviewer" && transcript.length > 0) {
    const checklist = debateContext.isReReview
      ? buildScopedReReviewChecklist({
          targetRole: debateContext.reReviewTargetRole ?? null,
          issues: debateContext.reReviewIssues ?? [],
          roster,
        })
      : buildReviewerPreflightChecklist(transcript, roster);

    messages.push({
      role: "user",
      content: checklist,
    });
  }

  messages.push({
    role: "user",
    content: getAgentTurnPrompt(
      role,
      productIdea,
      roster,
      roster.templateId,
      debateContext,
    ),
  });

  return applyPromptContextBudget(messages).messages;
}

function formatTranscriptMessage(entry: TranscriptEntry): string {
  return `**${entry.agentName}** (${entry.role}):\n\n${entry.content}`;
}
