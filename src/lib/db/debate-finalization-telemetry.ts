import type { SimulationAgentRole } from "@/ai/agents/config";
import type { AcceptedCriticalRisk } from "@/ai/orchestration/debate-convergence-controller";
import type { SectionDumpDiagnostics } from "@/ai/orchestration/section-dump-normalizer";

/**
 * Single authoritative finalization telemetry object for debate closure.
 * Prefer this over accumulating independent boolean flags.
 */
export interface DebateFinalizationTelemetry {
  readonly reason: string;
  readonly rejectCount: number;
  readonly correctionsByRole: Readonly<Partial<Record<SimulationAgentRole, number>>>;
  readonly acceptedCriticalRisks: readonly AcceptedCriticalRisk[];
  readonly outputDiagnostics: SectionDumpDiagnostics | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseCorrectionsByRole(
  value: unknown,
): Partial<Record<SimulationAgentRole, number>> {
  if (!isRecord(value)) {
    return {};
  }

  const result: Partial<Record<SimulationAgentRole, number>> = {};
  for (const [role, count] of Object.entries(value)) {
    if (typeof count === "number" && Number.isFinite(count)) {
      result[role as SimulationAgentRole] = count;
    }
  }
  return result;
}

function parseAcceptedCriticalRisks(value: unknown): AcceptedCriticalRisk[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const risks: AcceptedCriticalRisk[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    if (
      typeof item.issueId !== "string" ||
      typeof item.targetRole !== "string" ||
      typeof item.category !== "string" ||
      typeof item.excerpt !== "string" ||
      typeof item.acceptedOnTurn !== "number"
    ) {
      continue;
    }
    risks.push({
      issueId: item.issueId,
      targetRole: item.targetRole as SimulationAgentRole,
      category: item.category as AcceptedCriticalRisk["category"],
      excerpt: item.excerpt,
      acceptedOnTurn: item.acceptedOnTurn,
    });
  }
  return risks;
}

function parseOutputDiagnostics(value: unknown): SectionDumpDiagnostics | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.beforeDumpSectionCount !== "number" ||
    typeof value.afterDumpSectionCount !== "number" ||
    typeof value.wasNormalized !== "boolean" ||
    typeof value.wasHardCapped !== "boolean" ||
    typeof value.originalCharCount !== "number" ||
    typeof value.finalCharCount !== "number"
  ) {
    return null;
  }

  return {
    beforeDumpSectionCount: value.beforeDumpSectionCount,
    afterDumpSectionCount: value.afterDumpSectionCount,
    wasNormalized: value.wasNormalized,
    wasHardCapped: value.wasHardCapped,
    originalCharCount: value.originalCharCount,
    finalCharCount: value.finalCharCount,
  };
}

export function parseDebateFinalizationTelemetry(
  value: unknown,
): DebateFinalizationTelemetry | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (typeof value.reason !== "string" || typeof value.rejectCount !== "number") {
    return undefined;
  }

  return {
    reason: value.reason,
    rejectCount: value.rejectCount,
    correctionsByRole: parseCorrectionsByRole(value.correctionsByRole),
    acceptedCriticalRisks: parseAcceptedCriticalRisks(value.acceptedCriticalRisks),
    outputDiagnostics: parseOutputDiagnostics(value.outputDiagnostics),
  };
}

export function buildDebateFinalizationTelemetry(params: {
  readonly reason: string | null | undefined;
  readonly rejectCount: number;
  readonly correctionsByRole: Readonly<Partial<Record<SimulationAgentRole, number>>>;
  readonly acceptedCriticalRisks: readonly AcceptedCriticalRisk[];
  readonly outputDiagnostics: SectionDumpDiagnostics | null;
}): DebateFinalizationTelemetry {
  return {
    reason: params.reason?.trim() || "Deterministic debate finalization.",
    rejectCount: params.rejectCount,
    correctionsByRole: { ...params.correctionsByRole },
    acceptedCriticalRisks: [...params.acceptedCriticalRisks],
    outputDiagnostics: params.outputDiagnostics,
  };
}
