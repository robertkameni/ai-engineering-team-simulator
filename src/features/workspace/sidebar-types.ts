import type { RunStatus } from "@/lib/types";

export interface SidebarRunItemData {
  id: string;
  title: string;
  status: RunStatus;
  updatedAt: string;
}
