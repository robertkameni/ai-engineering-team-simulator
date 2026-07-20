import type { PartialRunArtifacts } from "@/features/artifacts/types";
import type { ArtifactType } from "@/features/artifacts/schemas";

export type RegenerateRunArtifactsError =
  | "not_found"
  | "forbidden"
  | "no_messages"
  | "run_in_progress"
  | "generation_active"
  | "generation_failed"
  | "budget_exceeded";

export type RegenerateRunArtifactsResult =
  | {
      ok: true;
      artifacts: PartialRunArtifacts;
      artifactDurationMs: number | null;
    }
  | {
      ok: false;
      error: RegenerateRunArtifactsError;
      message?: string;
      artifactDurationMs?: number | null;
    };

export type RegenerateRunArtifactsOptions = {
  readonly scope: import("@/lib/auth/run-ownership").RunOwnershipScope;
  readonly usageAccumulator?: import("@/lib/ai/run-usage-accumulator").RunUsageAccumulator;
  readonly artifactTypes?: readonly ArtifactType[];
  readonly onArtifactComplete?: (type: ArtifactType) => void;
};
