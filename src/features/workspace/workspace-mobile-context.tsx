"use client";

import { createContext, useContext } from "react";

interface WorkspaceMobileContextValue {
  openSidebar: () => void;
  openArtifacts: () => void;
  showArtifactsAction: boolean;
}

const WorkspaceMobileContext =
  createContext<WorkspaceMobileContextValue | null>(null);

export function useWorkspaceMobile() {
  return useContext(WorkspaceMobileContext);
}

export { WorkspaceMobileContext };
