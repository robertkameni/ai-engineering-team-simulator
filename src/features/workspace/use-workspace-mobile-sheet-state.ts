"use client";

import { useCallback, useState } from "react";

export function useWorkspaceMobileSheetState() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [sidebarSheetReady, setSidebarSheetReady] = useState(false);
  const [artifactsSheetReady, setArtifactsSheetReady] = useState(false);

  const openSidebar = useCallback(() => {
    setSidebarSheetReady(true);
    setSidebarOpen(true);
  }, []);

  const openArtifacts = useCallback(() => {
    setArtifactsSheetReady(true);
    setArtifactsOpen(true);
  }, []);

  return {
    sidebarOpen,
    setSidebarOpen,
    artifactsOpen,
    setArtifactsOpen,
    sidebarSheetReady,
    artifactsSheetReady,
    openSidebar,
    openArtifacts,
  };
}
