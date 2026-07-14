import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasSynthesisValidationWarnings,
  parseSynthesisValidationFlags,
  synthesisValidationWarningMessage,
} from "@/features/artifacts/synthesis-validation";

describe("synthesis validation helpers", () => {
  it("detects when either validation flag is set", () => {
    assert.equal(
      hasSynthesisValidationWarnings(
        parseSynthesisValidationFlags(true, false),
      ),
      true,
    );
    assert.equal(
      hasSynthesisValidationWarnings(
        parseSynthesisValidationFlags(false, false),
      ),
      false,
    );
  });

  it("builds a combined warning message", () => {
    const message = synthesisValidationWarningMessage(
      parseSynthesisValidationFlags(true, true),
    );

    assert.match(message, /stale dependency major versions/);
    assert.match(message, /reviewer open gaps/);
  });
});
