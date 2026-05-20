import type { RunStatus } from "@/features/agents/types";

export interface SidebarRunItemData {
  id: string;
  title: string;
  status: RunStatus;
  updatedAt: string;
}
