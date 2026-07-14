import type { PartialRunArtifacts } from "@/features/artifacts/types";

export type GenerateBlueprintArtifactError =
  | "not_found"
  | "forbidden"
  | "no_messages"
  | "run_in_progress"
  | "already_ready"
  | "generation_failed"
  | "budget_exceeded";

export type GenerateBlueprintArtifactResult =
  | {
      ok: true;
      artifacts: PartialRunArtifacts;
      stackValidationFailed: boolean;
      crossValidationFailed: boolean;
    }
  | { ok: false; error: GenerateBlueprintArtifactError; message?: string; };
