import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";
import type { TranscriptEntry } from "@/ai/context/transcript";
import type {
  ReviewOpenGap,
  ReviewOpenGapTopicKey,
} from "@/ai/artifacts/build-review-open-gaps.types";

const MAX_OPEN_GAP_EXCERPT_CHARS = 220;
const MAX_OPEN_GAPS = 8;

const UNRESOLVED_MARKER = /\bUNRESOLVED\b/i;
const DISAGREE_MARKER = /\*\*Disagree\*\*/i;
const NOT_IN_TEAM_PLAN = /\bnot in any teammate'?s plan\b/i;
const ONLY_IN_REVIEW =
  /\b(?:only in (?:my|your) (?:prior )?review|mitigation exists only in)/i;

export function extractReviewOpenGaps(
  transcript: readonly TranscriptEntry[],
  roster: TeamRoster,
): ReviewOpenGap[] {
  const gapMap = new Map<string, ReviewOpenGap>();

  for (const entry of transcript) {
    if (entry.role !== "reviewer") {
      continue;
    }

    const blocks = splitReviewerBlocks(entry.content);
    for (const block of blocks) {
      if (!isOpenGapBlock(block)) {
        continue;
      }

      const excerpt = normalizeExcerpt(block);
      if (excerpt.length < 24) {
        continue;
      }

      const topicKey = deriveTopicKey(excerpt);
      const ownerRole = inferOwnerRole(block, roster);
      const dedupeKey = `${topicKey}:${ownerRole ?? "none"}`;

      if (!gapMap.has(dedupeKey)) {
        gapMap.set(dedupeKey, { topicKey, excerpt, ownerRole });
      }
    }
  }

  return [...gapMap.values()].slice(0, MAX_OPEN_GAPS);
}

export function buildOpenGapsDirective(
  openGaps: readonly ReviewOpenGap[],
): string {
  if (openGaps.length === 0) {
    return "";
  }

  const lines = openGaps.map((gap) => {
    const owner = gap.ownerRole ? ` (owner: ${gap.ownerRole})` : "";
    return `- ${gap.excerpt}${owner}`;
  });

  return [
    "## Reviewer open gaps (NOT resolved in the debate)",
    "",
    "The reviewer explicitly marked these items as unresolved or not adopted by teammates.",
    "Do NOT describe them as implemented, mitigated, shipped, or present in the current plan.",
    "Use wording such as \"recommended\", \"proposed\", \"open gap\", or \"reviewer flagged — unresolved\".",
    "",
    ...lines,
  ].join("\n");
}

function splitReviewerBlocks(content: string): string[] {
  const sections = content.split(/\n(?=##\s+)/);
  if (sections.length > 1) {
    return sections.flatMap((section) => splitNumberedBlocks(section));
  }
  return splitNumberedBlocks(content);
}

function splitNumberedBlocks(text: string): string[] {
  const blocks = text.split(/\n(?=\*\*\d+\.\s)/);
  if (blocks.length > 1) {
    return blocks.map((block) => block.trim()).filter(Boolean);
  }

  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length >= 24);
}

function isOpenGapBlock(block: string): boolean {
  return (
    UNRESOLVED_MARKER.test(block) ||
    DISAGREE_MARKER.test(block) ||
    NOT_IN_TEAM_PLAN.test(block) ||
    ONLY_IN_REVIEW.test(block)
  );
}

function normalizeExcerpt(block: string): string {
  const singleLine = block.replace(/\s+/g, " ").trim();
  if (singleLine.length <= MAX_OPEN_GAP_EXCERPT_CHARS) {
    return singleLine;
  }
  return `${singleLine.slice(0, MAX_OPEN_GAP_EXCERPT_CHARS).trimEnd()}…`;
}

function deriveTopicKey(text: string): ReviewOpenGapTopicKey {
  const lower = text.toLowerCase();

  if (/claimed_by|outbox.*poller|unclaimed rows/.test(lower)) {
    return "outbox_claimed_by";
  }
  if (/per-provider|worker starvation|shared bullmq|slackqueue|googlequeue/.test(lower)) {
    return "per_provider_queues";
  }
  if (/session expiry|token expir|expiry warning|silent redirect/.test(lower)) {
    return "session_expiry_warning";
  }
  if (/backup verification|pg_restore|restore verification|corrupted dump/.test(lower)) {
    return "backup_verification";
  }

  return "generic";
}

function inferOwnerRole(
  block: string,
  roster: TeamRoster,
): ReviewOpenGap["ownerRole"] {
  const roleMatch = block.match(
    /\*\*(?:\d+\.\s*)?(pm|architect|backend|frontend|devops)\*\*/i,
  );
  if (roleMatch) {
    return roleMatch[1]!.toLowerCase() as ReviewOpenGap["ownerRole"];
  }

  const lowerBlock = block.toLowerCase();
  for (const role of ["pm", "architect", "backend", "frontend", "devops"] as const) {
    const memberName = roster[role].name.toLowerCase();
    if (lowerBlock.includes(memberName)) {
      return role;
    }
  }

  return null;
}
