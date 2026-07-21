import { generateText, Output } from "ai";

import { sectionGuidelinesForArtifact } from "@/ai/artifacts/artifact-templates";
import { buildSimulationStackReferenceDirective } from "@/ai/context/simulation-stack-reference";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import { buildArtifactLanguageDirective } from "@/ai/context/detect-product-language";
import {
  assertSimulationWithinBudget,
  isSimulationBudgetExceeded,
} from "@/ai/orchestration/simulation-budget";
import {
  isUnapprovedDebateExitOutcome,
  type DebateExitOutcome,
} from "@/ai/orchestration/reviewer-decision";
import { getDeepSeekModel } from "@/ai/providers";
import { DEEPSEEK_CHAT_OPTIONS } from "@/ai/deepseek-options";
import {
  type ArtifactDocument,
  type ArtifactType,
  artifactDocumentSchema,
  type RunArtifactsOutput,
} from "@/features/artifacts/schemas";
import type { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";

const ARTIFACT_MODEL = "deepseek-v4-flash" as const;

export const ARTIFACT_SYNTHESIS_ORDER = [
  "requirements",
  "architecture",
  "implementation",
  "blueprint",
  "review",
] as const satisfies readonly ArtifactType[];

// STATE CONSISTENCY — notice for every unapproved exit, including degraded_truncated
const UNAPPROVED_DEBATE_NOTICE =
  "DEBATE_STATUS: unapproved — The simulation ended without a clean approved close (cap_reached, degraded_truncated, reviewer unresolved, or budget failure). This document MUST be conservative: do NOT describe open reviewer gaps as resolved, do NOT promote recommendations to implemented features, and label every recommendation, proposed mitigation, and risk item as provisional or recommended — never as finalized or shipped.";

const SOFTWARE_ARTIFACT_FOCUS: Record<ArtifactType, string> = {
  requirements:
    "Product scope, users, v1 features, user stories, exclusions, measurable success criteria.",
  architecture:
    "Components, data entities, APIs/events, auth, background jobs, and technical risks.",
  implementation:
    "Backend and frontend stacks, CI/CD, environments, observability, key modules, testing approach, and rollout plan.",
  blueprint:
    "Concrete build-ready details extracted from the debate: exact dependency names and versions, project directory tree, every API endpoint with method and path, database tables with columns and types, environment variables with descriptions, and key TypeScript interfaces or component signatures.",
  review:
    "Where the team agreed, key disagreements, top risks, and prioritized recommendations.",
};

const PHYSICAL_ARTIFACT_FOCUS: Record<ArtifactType, string> = {
  requirements:
    "Work scope, stakeholders, site context, key deliverables, exclusions, measurable success criteria.",
  architecture:
    "Technical design, materials, site constraints, regulatory compliance, and technical risks.",
  implementation:
    "Execution plan, phasing, budget scenarios, resources, contractors, and delivery risks.",
  blueprint:
    "Concrete build-ready details extracted from the debate: materials with specifications and vendors, site layout dimensions, equipment list with models, compliance requirements with standards, budget line items with costs, and key technical specs.",
  review:
    "Where the team agreed, key disagreements, top risks, and prioritized recommendations.",
};

export function needsUnapprovedDebateNotice(
  outcome: DebateExitOutcome | null,
): boolean {
  return isUnapprovedDebateExitOutcome(outcome);
}

function artifactUsesStackReference(type: ArtifactType): boolean {
  return (
    type === "requirements" ||
    type === "architecture" ||
    type === "implementation" ||
    type === "blueprint"
  );
}

function artifactFocusForTemplate(
  type: ArtifactType,
  templateId: TeamTemplateId,
): string {
  const focus =
    templateId === "physical" ? PHYSICAL_ARTIFACT_FOCUS : SOFTWARE_ARTIFACT_FOCUS;
  return focus[type];
}

function buildStackReferenceBlock(type: ArtifactType): string {
  if (!artifactUsesStackReference(type)) {
    return "";
  }

  const directive = buildSimulationStackReferenceDirective();
  if (type === "blueprint") {
    return `${directive}\n\nBlueprint rule: dependency versions MUST match the verified stack reference and the implementation artifact. Never cite stale major versions when a newer verified version is listed.\n\n`;
  }

  if (type === "requirements") {
    return `${directive}\n\nRequirements rule: when the debate revised v1 scope, align feature bullets with the resolved consensus — not original PM proposals that were deferred or replaced.\n\n`;
  }

  return `${directive}\n\n`;
}

export function buildPriorArtifactsPrompt(
  type: ArtifactType,
  priorArtifacts: Partial<RunArtifactsOutput>,
): string {
  const priorTypes = ARTIFACT_SYNTHESIS_ORDER.filter(
    (artifactType) =>
      artifactType !== type && priorArtifacts[artifactType] != null,
  );

  if (priorTypes.length === 0) {
    return "";
  }

  const sections = priorTypes.map((artifactType) => {
    const document = priorArtifacts[artifactType]!;
    return `### ${artifactType}\n${JSON.stringify(document.sections)}`;
  });

  return [
    "## Prior artifacts (authoritative — stay consistent)",
    "",
    ...sections,
    "",
  ].join("\n");
}

export function buildArtifactPrompt(
  transcriptPrompt: string,
  consensusDirectives: string,
  openGapsDirective: string,
  priorArtifactsPrompt: string,
): string {
  return [
    transcriptPrompt,
    consensusDirectives.trim() ? `\n\n${consensusDirectives.trim()}` : "",
    openGapsDirective.trim() ? `\n\n${openGapsDirective.trim()}` : "",
    priorArtifactsPrompt.trim() ? `\n\n${priorArtifactsPrompt.trim()}` : "",
  ].join("");
}

// STATE CONSISTENCY BUG FIX — apply open-gap rule to all artifact types
// so that no artifact silently resolves reviewer-flagged open items.
function buildOpenGapsSystemRule(type: ArtifactType): string {
  return [
    "Open-gap rule: When reviewer open gaps are listed in the prompt, never describe those items as implemented, mitigated, or already present.",
    "Use \"recommended\", \"proposed\", \"open gap\", or \"reviewer flagged — unresolved\" for those topics.",
  ].join(" ");
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error("No JSON object found in model response");
    }
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

export async function generateArtifactDocument(
  type: ArtifactType,
  prompt: string,
  templateId: TeamTemplateId,
  productIdea: string,
  usageAccumulator?: RunUsageAccumulator,
  debateOutcome?: DebateExitOutcome | null,
  additionalSystemNotice?: string,
): Promise<ArtifactDocument> {
  const sectionGuidelines = sectionGuidelinesForArtifact(type, templateId);
  const focus = artifactFocusForTemplate(type, templateId);
  const languageDirective = buildArtifactLanguageDirective(productIdea);

  // STATE CONSISTENCY BUG FIX — all artifact types for unapproved runs
  // must carry the provisional-status notice, not just the 'review' type.
  const unapprovedNotice = needsUnapprovedDebateNotice(debateOutcome ?? null)
    ? `${UNAPPROVED_DEBATE_NOTICE}\n\n`
    : "";

  const isUnapproved = needsUnapprovedDebateNotice(debateOutcome ?? null);
  const isBlueprint = type === "blueprint";
  const sectionRules = isBlueprint
    ? `- The document must cover these topics (one section each, in a logical order): ${sectionGuidelines}\n- 3–6 bullets per section; each bullet describes a concrete, copy-paste-ready detail in prose: exact version numbers, full file paths, SQL column types, API method+path pairs, environment variable names with descriptions, TypeScript interface signatures, or component prop types.\n- Describe everything in prose — never use code blocks. For example, instead of copying a SQL query verbatim, describe it as "SELECT expense_splits.member_id, SUM(share_cents) FROM expense_splits JOIN expenses ON expense_splits.expense_id = expenses.id WHERE expenses.group_id = $1 GROUP BY expense_splits.member_id."\n- Each bullet should be a self-contained technical specification item — not a narrative sentence.`
    : `- The document must cover these topics (one section each, in a logical order): ${sectionGuidelines}\n- 4–6 bullets per section; each bullet is 1–2 complete sentences with concrete detail (up to ~50 words per bullet).`;

  // STATE CONSISTENCY BUG FIX — conservative synthesis rule for unapproved runs
  const consensusRule = isUnapproved
    ? "Synthesize consensus where present; flag unresolved disagreements and open reviewer gaps in ALL artifact types. Do NOT resolve or close gaps that the debate left open."
    : "Synthesize consensus; note disagreement only in the review artifact.";

  const stackReferenceBlock = buildStackReferenceBlock(type);
  const openGapsSystemRule = buildOpenGapsSystemRule(type);

  const system = `${unapprovedNotice}${additionalSystemNotice ? `${additionalSystemNotice}\n\n` : ""}You are a technical writer producing the "${type}" deliverable from a team debate.

${stackReferenceBlock}Focus: ${focus}

Output rules:
${sectionRules}
- ${languageDirective}
${openGapsSystemRule ? `- ${openGapsSystemRule}\n` : ""}- Write as a polished internal document — NOT meeting notes.
- Do NOT append speaker names to bullets (no "(Name)" suffixes).
- ${consensusRule}
- When prior artifacts are provided, stay consistent with them. Do not reintroduce features deferred in the resolved consensus.
- When the same role spoke more than once, their merged latest message is authoritative.
- Omit sections with no substance from the debate.
- **No code blocks or code fences** (\`\`\`). This is a specification document for developers to implement from. Describe everything in prose. Use inline backticks only for single terms like file names, env vars, or function names.`;

  console.info("ARTIFACT SYNTHESIS start", {
    artifactType: type,
    templateId,
    promptChars: prompt.length,
    promptPreview: prompt.slice(0, 500),
    debateOutcome: debateOutcome ?? null,
  });

  try {
    if (usageAccumulator) {
      assertSimulationWithinBudget(usageAccumulator);
    }

    const structured = await generateText({
      model: getDeepSeekModel(ARTIFACT_MODEL),
      system,
      prompt,
      maxOutputTokens: 2400,
      temperature: 0.2,
      output: Output.object({ schema: artifactDocumentSchema }),
      providerOptions: {
        deepseek: DEEPSEEK_CHAT_OPTIONS,
      },
    });

    await usageAccumulator?.addFromGenerateTextResult(
      structured,
      ARTIFACT_MODEL,
    );

    if (usageAccumulator) {
      assertSimulationWithinBudget(usageAccumulator);
    }

    if (structured.output) {
      console.info("ARTIFACT SYNTHESIS structured ok", {
        artifactType: type,
        sectionCount: structured.output.sections.length,
      });
      return structured.output;
    }

    console.warn("ARTIFACT SYNTHESIS structured empty output", {
      artifactType: type,
    });
  } catch (error) {
    if (isSimulationBudgetExceeded(error)) {
      throw error;
    }
    console.warn(`Structured ${type} artifact failed, trying JSON fallback:`, {
      artifactType: type,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (usageAccumulator) {
    assertSimulationWithinBudget(usageAccumulator);
  }

  const fallback = await generateText({
    model: getDeepSeekModel(ARTIFACT_MODEL),
    system: `${system}

Respond with ONLY a JSON object: { "sections": [{ "title": string, "items": string[] }] }`,
    prompt,
    maxOutputTokens: 2400,
    temperature: 0.2,
    providerOptions: {
      deepseek: DEEPSEEK_CHAT_OPTIONS,
    },
  });

  await usageAccumulator?.addFromGenerateTextResult(fallback, ARTIFACT_MODEL);

  if (usageAccumulator) {
    assertSimulationWithinBudget(usageAccumulator);
  }

  const json = extractJsonObject(fallback.text);
  const parsed = artifactDocumentSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Failed to parse ${type} artifact: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
