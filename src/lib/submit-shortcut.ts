import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useSyncExternalStore } from "react";

export function isSubmitShortcut(
  event: ReactKeyboardEvent | KeyboardEvent,
): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    (event.key === "Enter" || event.code === "NumpadEnter")
  );
}

export function getSubmitShortcutLabel(): string {
  if (typeof navigator === "undefined") {
    return "Ctrl+Enter";
  }

  return /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent)
    ? "⌘ Enter"
    : "Ctrl+Enter";
}

export function useSubmitShortcutLabel(): string {
  return useSyncExternalStore(
    () => () => {},
    getSubmitShortcutLabel,
    () => "Ctrl+Enter",
  );
}
