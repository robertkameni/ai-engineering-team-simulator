import { SidebarContentStatic } from "@/features/workspace/sidebar-content-static";
import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";

interface SidebarStaticProps {
  pathname: string;
  runs: SidebarRunItemData[];
}

export function SidebarStatic({ pathname, runs }: SidebarStaticProps) {
  return (
    <aside className="@container/sidebar glass-panel hidden h-full w-full shrink-0 flex-col border-r-0 min-[720px]:flex min-[720px]:w-64 min-[720px]:border-r">
      <SidebarContentStatic pathname={pathname} runs={runs} />
    </aside>
  );
}
