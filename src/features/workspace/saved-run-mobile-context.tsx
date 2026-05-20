"use client";

import { createContext, useContext } from "react";

interface SavedRunMobileContextValue {
  openSidebar: () => void;
  openArtifacts: () => void;
}

const SavedRunMobileContext =
  createContext<SavedRunMobileContextValue | null>(null);

export function useSavedRunMobile() {
  return useContext(SavedRunMobileContext);
}

export { SavedRunMobileContext };
