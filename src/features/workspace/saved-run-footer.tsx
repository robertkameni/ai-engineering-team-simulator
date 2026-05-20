import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Lightweight footer for saved runs — no composer client bundle. */
export function SavedRunFooter() {
  return (
    <footer className="@container/composer glass-panel hidden h-21 shrink-0 items-center justify-center border-t-0 border-glass-border min-[720px]:flex">
      <Button asChild className="gap-2">
        <Link href="/workspace">
          <Plus className="size-4" aria-hidden />
          New simulation
        </Link>
      </Button>
    </footer>
  );
}
