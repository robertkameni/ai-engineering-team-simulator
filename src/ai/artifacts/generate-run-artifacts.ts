import { generateText, Output } from "ai";

import { sectionGuidelinesForArtifact } from "@/ai/artifacts/artifact-templates";
import { buildConsensusDirectives } from "@/ai/artifacts/build-consensus-directives";
import {
  buildOpenGapsDirective,
  extractReviewOpenGaps,
} from "@/ai/artifacts/build-review-open-gaps";
import { buildTranscriptForArtifacts } from "@/ai/artifacts/build-transcript";
import type {
  GenerateRunArtifactsResult,
  RetryCrossInconsistentArtifactsParams,
  RetryStackInconsistentArtifactsParams,
  StackRetryResult,
} from "@/ai/artifacts/generate-run-artifacts.types";
import { mergeCorrectionTurns } from "@/ai/artifacts/merge-correction-turns";
import {
  buildCrossConsistencyFixPrompt,
  resolveCrossRetryTypes,
  validateArtifactCrossConsistency,
} from "@/ai/artifacts/validate-artifact-cross-consistency";
import {
  buildDeterministicStackConsistencyFixPrompt,
  buildStackConsistencyFixPrompt,
  validateArtifactStackConsistency,
} from "@/ai/artifacts/validate-artifact-consistency";
import { buildSimulationStackReferenceDirective } from "@/ai/context/simulation-stack-reference";
import type { TeamRoster } from "@/ai/agents/roster";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { buildArtifactLanguageDirective } from "@/ai/context/detect-product-language";
import {
  assertSimulationWithinBudget,
  isSimulationBudgetExceeded,
} from "@/ai/orchestration/simulation-budget";
import {
  type DebateExitOutcome,
  parseDebateOutcomeFromRunSummary,
} from "@/ai/orchestration/reviewer-decision";
import { getDeepSeekModel } from "@/ai/providers";
import { DEEPSEEK_CHAT_OPTIONS } from "@/ai/deepseek-options";
import { CORE_ARTIFACT_TYPES } from "@/features/artifacts/artifact-constants";
import {
  type ArtifactDocument,
  type ArtifactType,
  artifactDocumentSchema,
  type RunArtifactsOutput,
} from "@/features/artifacts/schemas";
import type { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";

const ARTIFACT_MODEL = "deepseek-v4-flash" as const;

const ARTIFACT_SYNTHESIS_ORDER = [
  "requirements",
  "architecture",
  "implementation",
  "blueprint",
  "review",
] as const satisfies readonly ArtifactType[];

const UNAPPROVED_DEBATE_NOTICE =
  "DEBATE_STATUS: unapproved_cap — The simulation ended without an explicit [APPROVE]. Summarize open risks and label recommendations as provisional.";

function needsUnapprovedDebateNotice(outcome: DebateExitOutcome | null): boolean {
  return outcome === "cap_reached" || outcome === "unknown_reject_fallback";
}

function artifactUsesStackReference(type: ArtifactType): boolean {
  return (
    type === "requirements" ||
    type === "architecture" ||
    type === "implementation" ||
    type === "blueprint"
  );
}

function resolveSynthesisOrder(
  artifactTypes: readonly ArtifactType[],
): ArtifactType[] {
  const requested = new Set(artifactTypes);
  return ARTIFACT_SYNTHESIS_ORDER.filter((type) => requested.has(type));
}

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

function buildPriorArtifactsPrompt(
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

function buildArtifactPrompt(
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

function buildOpenGapsSystemRule(type: ArtifactType): string {
  if (
    type !== "architecture" &&
    type !== "implementation" &&
    type !== "blueprint"
  ) {
    return "";
  }

  return [
    "Open-gap rule: When reviewer open gaps are listed in the prompt, never describe those items as implemented, mitigated, or already present.",
    "Use \"recommended\", \"proposed\", \"open gap\", or \"reviewer flagged — unresolved\" for those topics.",
  ].join(" ");
}

async function generateArtifactDocument(
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

  const unapprovedNotice =
    type === "review" && needsUnapprovedDebateNotice(debateOutcome ?? null)
      ? `${UNAPPROVED_DEBATE_NOTICE}\n\n`
      : "";

  const isBlueprint = type === "blueprint";
  const sectionRules = isBlueprint
    ? `- The document must cover these topics (one section each, in a logical order): ${sectionGuidelines}\n- 3–6 bullets per section; each bullet describes a concrete, copy-paste-ready detail in prose: exact version numbers, full file paths, SQL column types, API method+path pairs, environment variable names with descriptions, TypeScript interface signatures, or component prop types.\n- Describe everything in prose — never use code blocks. For example, instead of copying a SQL query verbatim, describe it as "SELECT expense_splits.member_id, SUM(share_cents) FROM expense_splits JOIN expenses ON expense_splits.expense_id = expenses.id WHERE expenses.group_id = $1 GROUP BY expense_splits.member_id."\n- Each bullet should be a self-contained technical specification item — not a narrative sentence.`
    : `- The document must cover these topics (one section each, in a logical order): ${sectionGuidelines}\n- 4–6 bullets per section; each bullet is 1–2 complete sentences with concrete detail (up to ~50 words per bullet).`;

  const stackReferenceBlock = buildStackReferenceBlock(type);
  const openGapsSystemRule = buildOpenGapsSystemRule(type);

  const system = `${unapprovedNotice}${additionalSystemNotice ? `${additionalSystemNotice}\n\n` : ""}You are a technical writer producing the "${type}" deliverable from a team debate.

${stackReferenceBlock}Focus: ${focus}

Output rules:
${sectionRules}
- ${languageDirective}
${openGapsSystemRule ? `- ${openGapsSystemRule}\n` : ""}- Write as a polished internal document — NOT meeting notes.
- Do NOT append speaker names to bullets (no "(Name)" suffixes).
- Synthesize consensus; note disagreement only in the review artifact.
- When prior artifacts are provided, stay consistent with them. Do not reintroduce features deferred in the resolved consensus.
- When the same role spoke more than once, their merged latest message is authoritative.
- Omit sections with no substance from the debate.
- **No code blocks or code fences** (\`\`\`). This is a specification document for developers to implement from. Describe everything in prose. Use inline backticks only for single terms like file names, env vars, or function names.`;

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
      return structured.output;
    }
  } catch (error) {
    if (isSimulationBudgetExceeded(error)) {
      throw error;
    }
    console.warn(`Structured ${type} artifact failed, trying JSON fallback:`, error);
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

function resolveStackRetryTypes(violations: readonly string[]): ArtifactType[] {
  const retryTypes = new Set<ArtifactType>();
  for (const violation of violations) {
    if (violation.startsWith("implementation:")) {
      retryTypes.add("implementation");
    }
    if (violation.startsWith("blueprint:")) {
      retryTypes.add("blueprint");
    }
  }
  return ARTIFACT_SYNTHESIS_ORDER.filter((type) => retryTypes.has(type));
}

function resolveSecondStackRetryTypes(violations: readonly string[]): ArtifactType[] {
  const hasBlueprintViolation = violations.some((violation) =>
    violation.startsWith("blueprint:"),
  );

  if (hasBlueprintViolation) {
    return ["blueprint"];
  }

  return resolveStackRetryTypes(violations);
}

async function regenerateStackArtifactsForViolations(
  params: RetryStackInconsistentArtifactsParams,
  retryTypes: readonly ArtifactType[],
  fixNotice: string,
): Promise<number> {
  const {
    output,
    transcriptPrompt,
    consensusDirectives,
    openGapsDirective,
    templateId,
    productIdea,
    usageAccumulator,
    debateOutcome,
    onArtifactComplete,
  } = params;

  for (const type of retryTypes) {
    if (usageAccumulator) {
      assertSimulationWithinBudget(usageAccumulator);
    }

    const priorArtifactsPrompt = buildPriorArtifactsPrompt(type, output);
    const prompt = buildArtifactPrompt(
      transcriptPrompt,
      consensusDirectives,
      openGapsDirective,
      priorArtifactsPrompt,
    );

    const document = await generateArtifactDocument(
      type,
      prompt,
      templateId,
      productIdea,
      usageAccumulator,
      debateOutcome,
      fixNotice,
    );

    output[type] = document;
    await onArtifactComplete?.(type, document);
  }

  return retryTypes.length;
}

async function retryStackInconsistentArtifacts(
  params: RetryStackInconsistentArtifactsParams,
): Promise<StackRetryResult> {
  let violations = validateArtifactStackConsistency(params.output);
  if (violations.length === 0) {
    return { retryCount: 0, stackValidationFailed: false };
  }

  let retryCount = 0;

  retryCount += await regenerateStackArtifactsForViolations(
    params,
    resolveStackRetryTypes(violations),
    buildStackConsistencyFixPrompt(violations),
  );

  violations = validateArtifactStackConsistency(params.output);
  if (violations.length === 0) {
    return { retryCount, stackValidationFailed: false };
  }

  retryCount += await regenerateStackArtifactsForViolations(
    params,
    resolveSecondStackRetryTypes(violations),
    buildDeterministicStackConsistencyFixPrompt(violations),
  );

  violations = validateArtifactStackConsistency(params.output);
  if (violations.length > 0) {
    console.warn("Stack validation failed after retries", { violations });
    return { retryCount, stackValidationFailed: true };
  }

  return { retryCount, stackValidationFailed: false };
}

async function retryCrossInconsistentArtifacts(
  params: RetryCrossInconsistentArtifactsParams,
): Promise<number> {
  const {
    output,
    openGaps,
    transcriptPrompt,
    consensusDirectives,
    openGapsDirective,
    templateId,
    productIdea,
    usageAccumulator,
    debateOutcome,
    onArtifactComplete,
  } = params;

  const violations = validateArtifactCrossConsistency(output, openGaps);
  if (violations.length === 0) {
    return 0;
  }

  const fixNotice = buildCrossConsistencyFixPrompt(violations);
  const retryTypes = resolveCrossRetryTypes(violations);

  for (const type of retryTypes) {
    if (usageAccumulator) {
      assertSimulationWithinBudget(usageAccumulator);
    }

    const priorArtifactsPrompt = buildPriorArtifactsPrompt(type, output);
    const prompt = buildArtifactPrompt(
      transcriptPrompt,
      consensusDirectives,
      openGapsDirective,
      priorArtifactsPrompt,
    );

    const document = await generateArtifactDocument(
      type,
      prompt,
      templateId,
      productIdea,
      usageAccumulator,
      debateOutcome,
      fixNotice,
    );

    output[type] = document;
    await onArtifactComplete?.(type, document);
  }

  return retryTypes.length;
}

export async function generateRunArtifacts({
  productIdea,
  transcript,
  roster,
  onArtifactComplete,
  usageAccumulator,
  runSummary,
  artifactTypes = CORE_ARTIFACT_TYPES,
}: {
  productIdea: string;
  transcript: TranscriptEntry[];
  roster: TeamRoster;
  onArtifactComplete?: (
    type: ArtifactType,
    document: ArtifactDocument,
  ) => Promise<void> | void;
  usageAccumulator?: RunUsageAccumulator;
  runSummary?: string | null;
  artifactTypes?: readonly ArtifactType[];
}): Promise<GenerateRunArtifactsResult> {
  const templateId = roster.templateId;
  const debateOutcome = parseDebateOutcomeFromRunSummary(runSummary ?? null);
  const mergedTranscript = mergeCorrectionTurns(transcript);
  const openGaps = extractReviewOpenGaps(mergedTranscript);
  const openGapsDirective = buildOpenGapsDirective(openGaps);
  const consensusDirectives = buildConsensusDirectives(mergedTranscript);
  const transcriptPrompt = buildTranscriptForArtifacts(
    productIdea,
    transcript,
    roster,
  );

  if (usageAccumulator) {
    assertSimulationWithinBudget(usageAccumulator);
  }

  const synthesisOrder = resolveSynthesisOrder(artifactTypes);
  const output: Partial<RunArtifactsOutput> = {};

  for (const type of synthesisOrder) {
    if (usageAccumulator) {
      assertSimulationWithinBudget(usageAccumulator);
    }

    const priorArtifactsPrompt = buildPriorArtifactsPrompt(type, output);
    const prompt = buildArtifactPrompt(
      transcriptPrompt,
      consensusDirectives,
      openGapsDirective,
      priorArtifactsPrompt,
    );

    const document = await generateArtifactDocument(
      type,
      prompt,
      templateId,
      productIdea,
      usageAccumulator,
      debateOutcome,
    );

    output[type] = document;
    await onArtifactComplete?.(type, document);
  }

  const stackRetryResult = await retryStackInconsistentArtifacts({
    output,
    transcriptPrompt,
    consensusDirectives,
    openGapsDirective,
    templateId,
    productIdea,
    usageAccumulator,
    debateOutcome: debateOutcome ?? null,
    onArtifactComplete,
  });

  const crossRetries = await retryCrossInconsistentArtifacts({
    output,
    openGaps,
    transcriptPrompt,
    consensusDirectives,
    openGapsDirective,
    templateId,
    productIdea,
    usageAccumulator,
    debateOutcome: debateOutcome ?? null,
    onArtifactComplete,
  });

  return {
    artifacts: output,
    consistencyRetries: stackRetryResult.retryCount + crossRetries,
    stackValidationFailed: stackRetryResult.stackValidationFailed,
  };
}
