"use client";

import { usePathname } from "next/navigation";

import { SidebarContent } from "@/features/workspace/sidebar-content";
import { useMinWidth } from "@/lib/use-media-query";

export function Sidebar() {
  const pathname = usePathname();
  const isDesktop = useMinWidth(720);

  if (!isDesktop) {
    return null;
  }

  return (
    <aside className="@container/sidebar glass-panel flex h-full w-full shrink-0 flex-col border-r-0 min-[720px]:w-64 min-[720px]:border-r">
      <SidebarContent pathname={pathname} />
    </aside>
  );
}
