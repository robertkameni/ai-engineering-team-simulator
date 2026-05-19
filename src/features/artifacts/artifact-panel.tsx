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

import type { ArtifactType } from "@/features/artifacts/schemas";

import type {

  ArtifactSectionGroup,

  ArtifactsPanelStatus,

  RunArtifacts,

} from "@/features/artifacts/types";



function ArtifactSections({ sections }: { sections: ArtifactSectionGroup[] }) {

  if (sections.length === 0) {

    return (

      <p className="text-sm text-muted-foreground">No sections extracted.</p>

    );

  }



  return (

    <div className="flex flex-col gap-4 pb-6">

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

    </div>

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

    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">

      {status === "generating" ? (

        <span className="mb-3 size-2 animate-pulse rounded-full bg-agent-architect" />

      ) : null}

      <p className="text-sm text-muted-foreground">{copy}</p>

    </div>

  );

}



const TAB_CONFIG: { value: ArtifactType; label: string }[] = [

  { value: "requirements", label: "Requirements" },

  { value: "architecture", label: "Architecture" },

  { value: "implementation", label: "Implementation" },

  { value: "review", label: "Review" },

];



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

    <aside className="hidden h-svh min-h-0 w-[min(100%,420px)] shrink-0 flex-col border-l border-border bg-surface-1 lg:flex">

      <div className="shrink-0 border-b border-border px-4 py-3">

        <h2 className="text-sm font-semibold tracking-tight">Artifacts</h2>

        <p className="mt-0.5 text-xs text-muted-foreground">

          Structured outputs from the team

        </p>

      </div>



      {isReady ? (

        <Tabs

          defaultValue="requirements"

          className="flex min-h-0 flex-1 flex-col"

        >

          <TabsList className="mx-4 mt-3 h-auto w-auto flex-wrap justify-start gap-1 bg-transparent p-0">

            {TAB_CONFIG.map((tab) => (

              <TabsTrigger

                key={tab.value}

                value={tab.value}

                className="rounded-md px-2.5 py-1 text-xs data-[state=active]:bg-surface-2"

              >

                {tab.label}

              </TabsTrigger>

            ))}

          </TabsList>



          {TAB_CONFIG.map((tab) => (

            <TabsContent

              key={tab.value}

              value={tab.value}

              className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"

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


