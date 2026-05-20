"use client";

import { usePathname } from "next/navigation";

import { SidebarContent } from "@/features/workspace/sidebar-content";
import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";

interface SidebarProps {
  initialRecentRuns?: SidebarRunItemData[];
}

export function Sidebar({ initialRecentRuns }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="@container/sidebar glass-panel hidden h-full w-full shrink-0 flex-col border-r-0 min-[720px]:flex min-[720px]:w-64 min-[720px]:border-r">
      <SidebarContent
        pathname={pathname}
        initialRecentRuns={initialRecentRuns}
      />
    </aside>
  );
}
