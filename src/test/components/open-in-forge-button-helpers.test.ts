import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  completeForgePopup,
  isForgeHandoffEnabled,
  openForgePlaceholder,
} from "@/components/open-in-forge-button-helpers";

function createPopupWindow() {
  let replacedUrl: string | null = null;
  let closeCallCount = 0;

  const popup = {
    opener: { isParent: true } as Window["opener"],
    closed: false,
    close() {
      closeCallCount += 1;
    },
    location: {
      replace(url: string) {
        replacedUrl = url;
      },
    },
  };

  return {
    popup,
    getCloseCallCount: () => closeCallCount,
    getReplacedUrl: () => replacedUrl,
  };
}

describe("open-in-forge-button helpers", () => {
  it("opens a retained placeholder tab and clears its opener", () => {
    const { popup } = createPopupWindow();

    const result = openForgePlaceholder(() => popup);

    assert.equal(result, popup);
    assert.equal(popup.opener, null);
  });

  it("reuses the retained placeholder tab for the tracker URL", () => {
    const { popup, getReplacedUrl } = createPopupWindow();

    const didOpen = completeForgePopup(
      popup,
      "https://forge.example/tracker/123",
      () => null,
    );

    assert.equal(didOpen, true);
    assert.equal(getReplacedUrl(), "https://forge.example/tracker/123");
  });

  it("falls back to a direct tracker open when the placeholder is unavailable", () => {
    let fallbackUrl: string | null = null;
    let fallbackFeatures: string | null = null;

    const didOpen = completeForgePopup(
      null,
      "https://forge.example/tracker/123",
      (url, _target, features) => {
        fallbackUrl = String(url);
        fallbackFeatures = features ?? null;
        return createPopupWindow().popup;
      },
    );

    assert.equal(didOpen, true);
    assert.equal(fallbackUrl, "https://forge.example/tracker/123");
    assert.equal(fallbackFeatures, "noopener,noreferrer");
  });

  it("returns false when both popup attempts are blocked", () => {
    const { popup, getCloseCallCount } = createPopupWindow();
    popup.closed = true;

    const didOpen = completeForgePopup(
      popup,
      "https://forge.example/tracker/123",
      () => null,
    );

    assert.equal(didOpen, false);
    assert.equal(getCloseCallCount(), 0);
  });

  it("enables Forge when the public handoff flag is true", () => {
    const isEnabled = isForgeHandoffEnabled({
      NEXT_PUBLIC_FORGE_HANDOFF_ENABLED: "true",
    });

    assert.equal(isEnabled, true);
  });

  it("enables Forge when the public base URL is present", () => {
    const isEnabled = isForgeHandoffEnabled({
      NEXT_PUBLIC_FORGE_BASE_URL: "https://forge.example",
    });

    assert.equal(isEnabled, true);
  });

  it("disables Forge when public client config is absent", () => {
    const isEnabled = isForgeHandoffEnabled({});

    assert.equal(isEnabled, false);
  });
});
