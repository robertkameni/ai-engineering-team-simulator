import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildApiSurfaceDirective,
  extractDeclaredApiSurface,
} from "@/ai/context/api-surface";
import type { TranscriptEntry } from "@/ai/context/transcript";

function entry(role: TranscriptEntry["role"], content: string): TranscriptEntry {
  return { role, agentName: role, content };
}

describe("extractDeclaredApiSurface", () => {
  it("collects method + path pairs across the debate and dedupes", () => {
    const transcript = [
      entry("backend", "Declares POST /api/keys/connect and GET /api/metrics/mrr."),
      entry("devops", "Webhooks at POST /api/webhooks/stripe and POST /api/webhooks/stripe again."),
      entry("reviewer", "The backend's GET /api/metrics/mrr keyset pagination is fine."),
    ];

    const surface = extractDeclaredApiSurface(transcript);

    assert.deepEqual(
      surface.map((item) => `${item.method} ${item.path}`),
      [
        "POST /api/keys/connect",
        "GET /api/metrics/mrr",
        "POST /api/webhooks/stripe",
      ],
    );
  });

  it("drops trailing punctuation from paths", () => {
    const surface = extractDeclaredApiSurface([
      entry("backend", "POST /api/deliveries/confirm, plus GET /api/health."),
    ]);

    assert.deepEqual(
      surface.map((item) => item.path),
      ["/api/deliveries/confirm", "/api/health"],
    );
  });

  it("keeps bracket placeholders in parameterized paths", () => {
    const surface = extractDeclaredApiSurface([
      entry(
        "backend",
        "Reads: GET /api/accounts/[id]/snapshot?date= and GET /api/accounts/[id]/cohorts.",
      ),
    ]);

    assert.deepEqual(
      surface.map((item) => `${item.method} ${item.path}`),
      [
        "GET /api/accounts/[id]/snapshot?date=",
        "GET /api/accounts/[id]/cohorts",
      ],
    );
  });

  it("returns nothing when no endpoints were declared", () => {
    assert.deepEqual(extractDeclaredApiSurface([entry("pm", "Scope and users only.")]), []);
  });

  it("drops provider API paths that are not product /api/ routes", () => {
    const surface = extractDeclaredApiSurface([
      entry(
        "devops",
        "Preflight calls GET /v1/account (Stripe) and GET /subscriptions (Paddle).",
      ),
      entry("backend", "Product reads use GET /api/accounts/[id]/snapshot."),
    ]);

    assert.deepEqual(
      surface.map((item) => `${item.method} ${item.path}`),
      ["GET /api/accounts/[id]/snapshot"],
    );
  });
});

describe("buildApiSurfaceDirective", () => {
  it("lists the computed endpoints as ground truth", () => {
    const directive = buildApiSurfaceDirective([
      { method: "POST", path: "/api/keys/connect" },
      { method: "GET", path: "/api/metrics/mrr" },
    ]);

    assert.match(directive, /Server-computed API surface/);
    assert.match(directive, /POST \/api\/keys\/connect/);
    assert.match(directive, /GET \/api\/metrics\/mrr/);
    assert.match(directive, /never add an endpoint no teammate declared/);
    assert.match(directive, /prefer the backend engineer's latest statement/);
  });

  it("returns empty string for an empty surface", () => {
    assert.equal(buildApiSurfaceDirective([]), "");
  });
});
