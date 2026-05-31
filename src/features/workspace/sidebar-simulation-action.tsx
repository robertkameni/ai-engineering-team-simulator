"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
interface SidebarSimulationActionProps {
  rerunPrompt?: string | null;
  onNavigate?: () => void;
}

export function SidebarSimulationAction({ onNavigate }: SidebarSimulationActionProps) {
  return (
    <Button
      className="w-full justify-start gap-2 transition-transform duration-200 hover:scale-[1.01] active:scale-[0.98]"
      asChild
    >
      <Link href="/workspace" onClick={onNavigate}>
        <Plus />
        Run new simulation
      </Link>
    </Button>
  );
}
