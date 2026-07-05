import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TranscriptEntry } from "@/ai/context/transcript";

export interface CriticismResult {
  criticized: boolean;
  excerpts: string[];
}

const CRITICAL_PATTERNS: RegExp[] = [
  /\bweakness(es)?\b/i,
  /\b(replacing|replace|drop|remove)\b/i,
  /\bhalf-measure\b/i,
  /\b(issue|problem|flaw|gap)\b/i,
  /\b(reject|disagree)\b/i,
  /\bdoes not account\b/i,
  /\bdoes not (handle|cover|address|consider)\b/i,
  /\bI will (change|modify|alter|revise|keep|add)\b/i,
  /\boperational (weakness|gap|concern)\b/i,
  /\bthis is (wrong|incorrect|problematic|insufficient)\b/i,
];

/**
 * Scans the transcript for substantive critiques directed at a specific agent
 * by teammates who spoke after them.
 */
export function detectPeerCriticism(
  transcript: TranscriptEntry[],
  targetName: string,
  criticRoles: SimulationAgentRole[],
): CriticismResult {
  const excerpts: string[] = [];

  for (const entry of transcript) {
    if (!criticRoles.includes(entry.role as SimulationAgentRole)) continue;
    if (!entry.content.includes(targetName)) continue;

    const paragraphs = entry.content.split("\n\n");
    for (const paragraph of paragraphs) {
      if (!paragraph.includes(targetName)) continue;
      if (!hasCriticalLanguage(paragraph)) continue;

      const cleaned = paragraph.replace(/\n+/g, " ").trim();
      if (cleaned.length > 20 && cleaned.length < 600) {
        excerpts.push(cleaned);
      }
    }
  }

  return { criticized: excerpts.length > 0, excerpts };
}

/**
 * Checks whether any agent in the transcript expressed substantive disagreement
 * with a previous agent. Returns false if the debate is entirely agreeable.
 */
export function hasAnySubstantiveDisagreement(
  transcript: TranscriptEntry[],
  agentNames: string[],
): boolean {
  for (const entry of transcript) {
    for (const name of agentNames) {
      if (name === entry.agentName) continue;
      if (!entry.content.includes(name)) continue;

      if (hasCriticalLanguage(entry.content)) {
        return true;
      }
    }
  }

  return false;
}

function hasCriticalLanguage(text: string): boolean {
  return CRITICAL_PATTERNS.some((pattern) => pattern.test(text));
}
