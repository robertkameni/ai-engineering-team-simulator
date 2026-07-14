import type { PartialRunArtifacts } from "@/features/artifacts/types";

export type RegenerateRunArtifactsError =
  | "not_found"
  | "forbidden"
  | "no_messages"
  | "run_in_progress"
  | "generation_active"
  | "generation_failed"
  | "budget_exceeded";

export type RegenerateRunArtifactsResult =
  | { ok: true; artifacts: PartialRunArtifacts; }
  | { ok: false; error: RegenerateRunArtifactsError; message?: string; };
