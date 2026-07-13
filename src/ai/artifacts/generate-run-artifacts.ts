import { generateText, Output } from "ai";

import { sectionGuidelinesForArtifact } from "@/ai/artifacts/artifact-templates";
import { buildTranscriptForArtifacts } from "@/ai/artifacts/build-transcript";
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
import {
  CORE_ARTIFACT_TYPES,
  type ArtifactDocument,
  type ArtifactType,
  artifactDocumentSchema,
  type RunArtifactsOutput
} from "@/features/artifacts/schemas";
import type { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";

const ARTIFACT_MODEL = "deepseek-v4-flash" as const;

const UNAPPROVED_DEBATE_NOTICE =
  "DEBATE_STATUS: unapproved_cap — The simulation ended without an explicit [APPROVE]. Summarize open risks and label recommendations as provisional.";

function needsUnapprovedDebateNotice(outcome: DebateExitOutcome | null): boolean {
  return outcome === "cap_reached" || outcome === "unknown_reject_fallback";
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

async function generateArtifactDocument(
  type: ArtifactType,
  transcriptPrompt: string,
  templateId: TeamTemplateId,
  productIdea: string,
  usageAccumulator?: RunUsageAccumulator,
  debateOutcome?: DebateExitOutcome | null,
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

  const system = `${unapprovedNotice}You are a technical writer producing the "${type}" deliverable from a team debate.

Focus: ${focus}

Output rules:
${sectionRules}
- ${languageDirective}
- Write as a polished internal document — NOT meeting notes.
- Do NOT append speaker names to bullets (no "(Name)" suffixes).
- Synthesize consensus; note disagreement only in the review artifact.
- Omit sections with no substance from the debate.
- **No code blocks or code fences** (\`\`\`). This is a specification document for developers to implement from. Describe everything in prose. Use inline backticks only for single terms like file names, env vars, or function names.`;

  try {
    if (usageAccumulator) {
      assertSimulationWithinBudget(usageAccumulator);
    }

    const structured = await generateText({
      model: getDeepSeekModel(ARTIFACT_MODEL),
      system,
      prompt: transcriptPrompt,
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
    prompt: transcriptPrompt,
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
}): Promise<Partial<RunArtifactsOutput>> {
  const templateId = roster.templateId;
  const debateOutcome = parseDebateOutcomeFromRunSummary(runSummary ?? null);
  const transcriptPrompt = buildTranscriptForArtifacts(
    productIdea,
    transcript,
    roster,
  );

  if (usageAccumulator) {
    assertSimulationWithinBudget(usageAccumulator);
  }

  const parallelEntries = await Promise.all(
    artifactTypes.map(async (type) => {
      if (usageAccumulator) {
        assertSimulationWithinBudget(usageAccumulator);
      }

      const document = await generateArtifactDocument(
        type,
        transcriptPrompt,
        templateId,
        productIdea,
        usageAccumulator,
        debateOutcome,
      );
      await onArtifactComplete?.(type, document);
      return [type, document] as const;
    }),
  );

  const entries: [ArtifactType, ArtifactDocument][] = parallelEntries.map(
    (entry) => [entry[0], entry[1]],
  );

  return Object.fromEntries(entries) as Partial<RunArtifactsOutput>;
}
