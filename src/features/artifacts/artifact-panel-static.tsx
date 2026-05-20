import { ArtifactPanelSkeleton } from "@/features/artifacts/artifact-panel-skeleton";
import { ArtifactSections } from "@/features/artifacts/artifact-sections";
import { RegenerateArtifactsButton } from "@/features/artifacts/regenerate-artifacts-button";
import { ARTIFACT_TAB_CONFIG, ARTIFACT_TAB_LIST_CLASS, ARTIFACT_TAB_TRIGGER_STATIC } from "@/features/artifacts/artifact-tab-styles";
import type {
  ArtifactsPanelStatus,
  RunArtifacts,
} from "@/features/artifacts/types";
import { cn } from "@/lib/utils";

function ArtifactPlaceholder({
  status,
  regenerateRunId,
  canRegenerateArtifacts,
}: {
  status: ArtifactsPanelStatus;
  regenerateRunId?: string;
  canRegenerateArtifacts?: boolean;
}) {
  const copy =
    status === "generating"
      ? "Synthesizing structured deliverables from the debate…"
      : status === "pending"
        ? "The team is debating — structured artifacts will generate when they finish."
        : status === "unavailable"
          ? "Artifacts could not be generated for this run. Regenerate from the saved debate or start a new simulation."
          : "Start a simulation to generate requirements, architecture, implementation, and review.";

  if (status === "generating") {
    return <ArtifactPanelSkeleton />;
  }

  return (
    <section className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      {status === "pending" ? (
        <span className="pulse-glow mb-3 size-2.5 rounded-full bg-agent-architect" />
      ) : null}
      <p className="text-body text-muted-foreground">{copy}</p>
      {status === "unavailable" &&
      canRegenerateArtifacts &&
      regenerateRunId ? (
        <RegenerateArtifactsButton
          variant="placeholder"
          runId={regenerateRunId}
        />
      ) : null}
    </section>
  );
}

interface ArtifactPanelStaticProps {
  artifacts?: RunArtifacts | null;
  status?: ArtifactsPanelStatus;
  regenerateRunId?: string;
  canRegenerateArtifacts?: boolean;
}

/** Server artifact panel — CSS tabs + native scroll (no Radix). */
export function ArtifactPanelStatic({
  artifacts = null,
  status = "idle",
  regenerateRunId,
  canRegenerateArtifacts = false,
}: ArtifactPanelStaticProps) {
  const isReady = status === "ready" && artifacts != null;
  const showRegenerate = canRegenerateArtifacts && regenerateRunId != null;

  return (
    <aside
      className={cn(
        "@container/artifact-panel glass-panel hidden min-h-0 shrink-0 flex-col overflow-x-hidden",
        "h-full max-h-none w-[min(100%,420px)] border-l border-glass-border min-[960px]:flex",
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-glass-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-title font-semibold tracking-tight">Artifacts</h2>
          <p className="mt-0.5 hidden text-caption text-muted-foreground @[720px]/artifact-panel:block">
            Structured outputs from the team
          </p>
        </div>
        {showRegenerate ? (
          <RegenerateArtifactsButton
            runId={regenerateRunId}
            disabled={status === "generating" || status === "pending"}
          />
        ) : null}
      </header>

      {isReady ? (
        <div className="artifact-static-tabs flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {ARTIFACT_TAB_CONFIG.map((tab, index) => (
            <input
              key={tab.value}
              type="radio"
              name="artifact-tab"
              id={`artifact-tab-${tab.value}`}
              value={tab.value}
              defaultChecked={index === 0}
              tabIndex={-1}
            />
          ))}

          <div
            className={cn(
              "artifact-static-labels min-w-0 shrink-0 px-4 pt-3 @max-sm/artifact-panel:pb-3",
              ARTIFACT_TAB_LIST_CLASS,
            )}
            role="tablist"
            aria-label="Artifact categories"
          >
            {ARTIFACT_TAB_CONFIG.map((tab) => (
              <label
                key={tab.value}
                htmlFor={`artifact-tab-${tab.value}`}
                title={tab.label}
                className={cn(ARTIFACT_TAB_TRIGGER_STATIC, "cursor-pointer")}
              >
                {tab.label}
              </label>
            ))}
          </div>

          <div className="artifact-static-panels flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {ARTIFACT_TAB_CONFIG.map((tab) => (
              <div
                key={tab.value}
                role="tabpanel"
                data-artifact-panel={tab.value}
                className="artifact-static-panel artifact-tab-content mt-0 min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 h-[calc(100svh-7.5rem)]"
              >
                <ArtifactSections sections={artifacts[tab.value]} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <ArtifactPlaceholder
          status={status}
          regenerateRunId={regenerateRunId}
          canRegenerateArtifacts={canRegenerateArtifacts}
        />
      )}
    </aside>
  );
}
