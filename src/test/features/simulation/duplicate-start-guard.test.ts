import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { shouldSuppressDuplicateStart } from "@/features/simulation/duplicate-start-guard";

describe("duplicate start guard", () => {
  it("suppresses a second start with the same prompt while one is in flight", () => {
    assert.equal(
      shouldSuppressDuplicateStart("Build an app", "Build an app"),
      true,
    );
  });

  it("trims whitespace before comparing prompts", () => {
    assert.equal(
      shouldSuppressDuplicateStart("Build an app", "  Build an app  "),
      true,
    );
  });

  it("allows the first start when nothing is in flight", () => {
    assert.equal(shouldSuppressDuplicateStart(null, "Build an app"), false);
  });

  it("allows a different prompt while another is in flight", () => {
    assert.equal(
      shouldSuppressDuplicateStart("Build an app", "Build another app"),
      false,
    );
  });
});
