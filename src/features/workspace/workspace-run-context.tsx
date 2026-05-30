"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

import type { RunStatus } from "@/features/agents/types";
import { hasWorkspacePrompt } from "@/lib/workspace-url";

export interface WorkspaceRunSession {
  currentPrompt: string;
  status: RunStatus;
  rerun: (prompt?: string) => void;
}

interface WorkspaceRunStore {
  session: WorkspaceRunSession | null;
  listeners: Set<() => void>;
}

let store: WorkspaceRunStore = {
  session: null,
  listeners: new Set(),
};

function emit() {
  for (const listener of store.listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

function getSnapshot() {
  return store.session;
}

export function WorkspaceRunProvider({ children }: { children: React.ReactNode }) {
  return children;
}

export function useWorkspaceRunSession(session: WorkspaceRunSession | null) {
  const stableSession = useMemo(() => {
    if (!session || !hasWorkspacePrompt(session.currentPrompt)) {
      return null;
    }
    return session;
  }, [session]);

  useEffect(() => {
    store = { ...store, session: stableSession };
    emit();
    return () => {
      if (store.session === stableSession) {
        store = { ...store, session: null };
        emit();
      }
    };
  }, [stableSession]);
}

export function useWorkspaceRun(): WorkspaceRunSession | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function workspaceRunCanRerun(session: WorkspaceRunSession | null): boolean {
  return session != null && session.status !== "running";
}
