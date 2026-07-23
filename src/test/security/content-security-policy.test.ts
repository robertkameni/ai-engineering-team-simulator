import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildContentSecurityPolicy,
  hasUnsafeScriptTokens,
} from "@/lib/http/content-security-policy";

describe("buildContentSecurityPolicy", () => {
  it("uses nonce-based script-src without unsafe tokens in production", () => {
    const csp = buildContentSecurityPolicy({
      nonce: "testNonceValue",
      isDevelopment: false,
    });

    assert.match(csp, /script-src 'self' 'nonce-testNonceValue' 'strict-dynamic'/);
    assert.equal(hasUnsafeScriptTokens(csp), false);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-eval'/);
  });

  it("allows unsafe-eval only in development script-src", () => {
    const csp = buildContentSecurityPolicy({
      nonce: "devNonce",
      isDevelopment: true,
    });

    assert.match(csp, /script-src 'self' 'nonce-devNonce' 'strict-dynamic' 'unsafe-eval'/);
    assert.equal(hasUnsafeScriptTokens(csp), true);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  });

  it("keeps style-src unsafe-inline for Tailwind and component libraries", () => {
    const csp = buildContentSecurityPolicy({
      nonce: "n",
      isDevelopment: false,
    });

    assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  });
});
