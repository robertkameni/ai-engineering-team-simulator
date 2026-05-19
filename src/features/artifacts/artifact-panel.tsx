import { MOCK_ARTIFACTS } from "@/features/simulation/mock-data";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

function ArtifactSections({
  sections,
}: {
  sections: { title: string; items: string[] }[];
}) {
  return (
    <div className="flex flex-col gap-5">
      {sections.map((section) => (
        <section key={section.title}>
          <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {section.title}
          </h3>
          <ul className="flex flex-col gap-2">
            {section.items.map((item) => (
              <li
                key={item}
                className="flex gap-2 text-sm leading-relaxed text-foreground/90"
              >
                <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function ArtifactPanel() {
  return (
    <aside className="hidden h-full w-[360px] shrink-0 flex-col border-l border-border bg-surface-1 xl:flex">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Artifacts</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Structured outputs from the team
        </p>
      </div>

      <Tabs
        defaultValue="requirements"
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <TabsList className="mx-4 mt-3 w-auto justify-start">
          <TabsTrigger value="requirements">Requirements</TabsTrigger>
          <TabsTrigger value="architecture">Architecture</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>

        <TabsContent
          value="requirements"
          className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
        >
          <ScrollArea className="h-full px-4 py-4">
            <ArtifactSections sections={MOCK_ARTIFACTS.requirements} />
          </ScrollArea>
        </TabsContent>
        <TabsContent
          value="architecture"
          className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
        >
          <ScrollArea className="h-full px-4 py-4">
            <ArtifactSections sections={MOCK_ARTIFACTS.architecture} />
          </ScrollArea>
        </TabsContent>
        <TabsContent
          value="review"
          className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
        >
          <ScrollArea className="h-full px-4 py-4">
            <ArtifactSections sections={MOCK_ARTIFACTS.review} />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
