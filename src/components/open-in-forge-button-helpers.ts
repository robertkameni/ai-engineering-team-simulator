export type ForgePopupWindow = {
  closed?: boolean;
  close: () => void;
  location: {
    replace: (url: string) => void;
  };
  opener: Window["opener"];
};

export type OpenWindow = (
  url?: string | URL,
  target?: string,
  features?: string,
) => ForgePopupWindow | null;

type ForgeHandoffPublicEnv = Readonly<Record<string, string | undefined>>;

const FORGE_FALLBACK_WINDOW_FEATURES = "noopener,noreferrer";

function hasPublicEnvValue(value: string | undefined): boolean {
  return value?.trim().length ? true : false;
}

export function isForgeHandoffEnabled(
  env: ForgeHandoffPublicEnv = process.env,
): boolean {
  return (
    env.NEXT_PUBLIC_FORGE_HANDOFF_ENABLED === "true" ||
    hasPublicEnvValue(env.NEXT_PUBLIC_FORGE_BASE_URL)
  );
}

export function openForgePlaceholder(
  openWindow: OpenWindow,
): ForgePopupWindow | null {
  const blankTab = openWindow("about:blank", "_blank");
  if (blankTab) {
    blankTab.opener = null;
  }

  return blankTab;
}

export function completeForgePopup(
  blankTab: ForgePopupWindow | null,
  trackerUrl: string,
  openWindow: OpenWindow,
): boolean {
  if (blankTab && blankTab.closed !== true) {
    blankTab.location.replace(trackerUrl);
    return true;
  }

  return (
    openWindow(trackerUrl, "_blank", FORGE_FALLBACK_WINDOW_FEATURES) !== null
  );
}
