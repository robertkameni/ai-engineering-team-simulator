"use client";

import { usePathname } from "next/navigation";

import { SidebarContent } from "@/features/workspace/sidebar-content";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="@container/sidebar glass-panel hidden h-full w-full shrink-0 flex-col border-r-0 @[720px]/app-shell:flex @[720px]/app-shell:w-64 @[720px]/app-shell:border-r">
      <SidebarContent pathname={pathname} />
    </aside>
  );
}
