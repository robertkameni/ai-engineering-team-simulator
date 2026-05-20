"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SidebarContent } from "@/features/workspace/sidebar-content";

interface SidebarMobileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
}

export function SidebarMobileSheet({
  open,
  onOpenChange,
  pathname,
}: SidebarMobileSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="glass-panel w-[min(100%,288px)] border-glass-border p-0 sm:max-w-xs"
      >
        <SheetTitle className="sr-only">Recent simulations</SheetTitle>
        <SheetDescription className="sr-only">
          Browse recent runs and start a new simulation
        </SheetDescription>
        <SidebarContent
          pathname={pathname}
          onNavigate={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
