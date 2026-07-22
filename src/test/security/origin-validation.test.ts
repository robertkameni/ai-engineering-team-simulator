import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getAllowedOrigins,
  isAllowedOrigin,
  isMutatingMethod,
} from "@/lib/http/validate-origin";

describe("validate-origin", () => {
  it("treats GET HEAD OPTIONS as safe and POST DELETE as mutating", () => {
    assert.equal(isMutatingMethod("GET"), false);
    assert.equal(isMutatingMethod("HEAD"), false);
    assert.equal(isMutatingMethod("OPTIONS"), false);
    assert.equal(isMutatingMethod("POST"), true);
    assert.equal(isMutatingMethod("DELETE"), true);
  });

  it("allows localhost:3100 Origin by default", () => {
    const origins = getAllowedOrigins();
    assert.equal(origins.has("http://localhost:3100"), true);
    assert.equal(origins.has("http://127.0.0.1:3100"), true);

    const request = new Request("http://localhost:3100/api/simulate", {
      method: "POST",
      headers: { Origin: "http://localhost:3100" },
    });
    assert.equal(isAllowedOrigin(request), true);
  });

  it("rejects missing or foreign Origin on mutating requests", () => {
    const missing = new Request("http://localhost:3100/api/simulate", {
      method: "POST",
    });
    assert.equal(isAllowedOrigin(missing), false);

    const foreign = new Request("http://localhost:3100/api/simulate", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });
    assert.equal(isAllowedOrigin(foreign), false);
  });

  it("allows Origin that matches the request URL origin", () => {
    const request = new Request("https://app.example/api/synthesize", {
      method: "POST",
      headers: { Origin: "https://app.example" },
    });
    assert.equal(isAllowedOrigin(request), true);
  });
});
