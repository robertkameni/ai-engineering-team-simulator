import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveArtifactsPanelStatus } from "../lib/artifacts-panel-status.js";

describe("deriveArtifactsPanelStatus", () => {
  it("maps complete+none to generating (not unavailable)", () => {
    assert.equal(deriveArtifactsPanelStatus("complete", "none"), "generating");
  });

  it("maps complete+failed to unavailable", () => {
    assert.equal(deriveArtifactsPanelStatus("complete", "failed"), "unavailable");
  });

  it("maps complete+ready to ready", () => {
    assert.equal(deriveArtifactsPanelStatus("complete", "ready"), "ready");
  });
});
