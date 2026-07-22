import {
  normalizeArtifactItem,
  normalizeArtifactTitle,
} from "@/features/artifacts/format-artifact";
import type { ArtifactSectionGroup } from "@/features/artifacts/types";

export function ArtifactSections({
  sections,
}: {
  sections: ArtifactSectionGroup[];
}) {
  if (sections.length === 0) {
    return (
      <p className="text-body text-muted-foreground">No sections extracted.</p>
    );
  }

  return (
    <section className="flex flex-col gap-4 pb-6">
      {sections.map((section, index) => {
        const title = normalizeArtifactTitle(section.title);
        const items = section.items
          .map(normalizeArtifactItem)
          .filter((item) => item.length > 0);

        if (items.length === 0) return null;

        return (
          <section
            key={`${index}-${title}`}
            className="glass-card rounded-xl px-3 py-3 message-enter"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <h3 className="mb-2.5 text-caption font-semibold tracking-wider text-foreground uppercase">
              {title}
            </h3>
            <ul className="list-disc space-y-1.5 pl-4 marker:text-muted-foreground/60">
              {items.map((item, itemIndex) => (
                <li
                  key={`${index}-${itemIndex}`}
                  className="text-body leading-snug text-foreground/90"
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
