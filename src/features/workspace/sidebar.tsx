"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { SidebarRecentRuns } from "@/features/workspace/sidebar-recent-runs";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-surface-1">
      <header className="flex items-center gap-2 px-4 py-4">
        <span className="flex size-8 items-center justify-center rounded-md border border-border bg-surface-2">
          <Sparkles className="size-4 text-foreground" />
        </span>
        <span className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">
            Team Sim
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            Engineering simulator
          </p>
        </span>
      </header>

      <section className="px-3 pb-2">
        <Button className="w-full justify-start gap-2" asChild>
          <Link href="/workspace">
            <Plus />
            New simulation
          </Link>
        </Button>
      </section>

      <Separator />

      <section className="px-4 py-3">
        <p className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
          Recent
        </p>
      </section>

      <ScrollArea className="flex-1 px-2">
        <nav className="flex flex-col gap-0.5 pb-4">
          <SidebarRecentRuns key={pathname} pathname={pathname} />
        </nav>
      </ScrollArea>
    </aside>
  );
}
