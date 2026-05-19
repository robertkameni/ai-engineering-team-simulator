import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  normalizeArtifactItem,
  normalizeArtifactTitle,
} from "@/features/artifacts/format-artifact";
import {
  ARTIFACT_TAB_CONFIG,
  ARTIFACT_TAB_LIST_CLASS,
  ARTIFACT_TAB_TRIGGER_BASE,
} from "@/features/artifacts/artifact-tab-styles";
import type {
  ArtifactSectionGroup,
  ArtifactsPanelStatus,
  RunArtifacts,
} from "@/features/artifacts/types";
import { cn } from "@/lib/utils";

function ArtifactSections({ sections }: { sections: ArtifactSectionGroup[] }) {
  if (sections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No sections extracted.</p>
    );
  }

  return (
    <section className="flex flex-col gap-4 pb-6">
      {sections.map((section) => {
        const title = normalizeArtifactTitle(section.title);
        const items = section.items
          .map(normalizeArtifactItem)
          .filter((item) => item.length > 0);

        if (items.length === 0) return null;

        return (
          <section
            key={title}
            className="rounded-lg border border-border/80 bg-surface-2/60 px-3 py-3"
          >
            <h3 className="mb-2.5 text-[11px] font-semibold tracking-wider text-foreground uppercase">
              {title}
            </h3>
            <ul className="list-disc space-y-2 pl-4 marker:text-muted-foreground/60">
              {items.map((item) => (
                <li
                  key={`${title}-${item}`}
                  className="text-[13px] leading-snug text-foreground/90"
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}

function ArtifactPlaceholder({ status }: { status: ArtifactsPanelStatus }) {
  const copy =
    status === "generating"
      ? "Synthesizing structured deliverables from the debate…"
      : status === "pending"
        ? "The team is debating — structured artifacts will generate when they finish."
        : status === "unavailable"
          ? "Artifacts could not be generated for this run. Start a new simulation to try again."
          : "Start a simulation to generate requirements, architecture, implementation, and review.";

  return (
    <section className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      {status === "generating" ? (
        <span className="mb-3 size-2 animate-pulse rounded-full bg-agent-architect" />
      ) : null}
      <p className="text-sm text-muted-foreground">{copy}</p>
    </section>
  );
}

interface ArtifactPanelProps {
  artifacts?: RunArtifacts | null;
  status?: ArtifactsPanelStatus;
}

export function ArtifactPanel({
  artifacts = null,
  status = "idle",
}: ArtifactPanelProps) {
  const isReady = status === "ready" && artifacts != null;

  return (
    <aside className="@container/artifact-panel hidden h-svh min-h-0 w-[min(100%,420px)] shrink-0 flex-col overflow-x-hidden border-l border-border bg-surface-1 lg:flex">
      <header className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Artifacts</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Structured outputs from the team
        </p>
      </header>

      {isReady ? (
        <Tabs
          defaultValue="requirements"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-w-0 shrink-0 px-4 pt-3">
            <TabsList className={ARTIFACT_TAB_LIST_CLASS}>
            {ARTIFACT_TAB_CONFIG.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={cn(ARTIFACT_TAB_TRIGGER_BASE, tab.triggerClass)}
              >
                {tab.label}
              </TabsTrigger>
            ))}
            </TabsList>
          </div>

          {ARTIFACT_TAB_CONFIG.map((tab) => (
            <TabsContent
              key={tab.value}
              value={tab.value}
              className="artifact-tab-content mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
            >
              <ScrollArea className="h-[calc(100svh-7.5rem)] px-4">
                <ArtifactSections sections={artifacts[tab.value]} />
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <ArtifactPlaceholder status={status} />
      )}
    </aside>
  );
}
