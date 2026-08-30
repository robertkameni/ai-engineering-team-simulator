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

  it("reads method plus path when the path is wrapped in backticks", () => {
    const surface = extractDeclaredApiSurface([
      entry(
        "backend",
        [
          "- **POST `/api/reservations`** — body `{ lockerId, date }`. Response: 201 or 409.",
          "- **DELETE `/api/reservations/:id`** — sets status=RELEASED; 204.",
          "- **GET `/api/lockers?date=ISO`** — returns slots; 5s cache.",
        ].join("\n"),
      ),
    ]);

    assert.deepEqual(
      surface.map((item) => `${item.method} ${item.path}`),
      [
        "POST /api/reservations",
        "DELETE /api/reservations/:id",
        "GET /api/lockers?date=ISO",
      ],
    );
  });

  it("keeps brace and trailing-bracket parameter placeholders", () => {
    const surface = extractDeclaredApiSurface([
      entry(
        "backend",
        "Retry is POST /api/reminders/{id} and GET /api/hires/[id].",
      ),
    ]);

    assert.deepEqual(
      surface.map((item) => `${item.method} ${item.path}`),
      ["POST /api/reminders/{id}", "GET /api/hires/[id]"],
    );
  });

  it("returns nothing when no endpoints were declared", () => {
    assert.deepEqual(extractDeclaredApiSurface([entry("pm", "Scope and users only.")]), []);
  });

  it("keeps public product routes that are not under /api/", () => {
    const surface = extractDeclaredApiSurface([
      entry("backend", "Public itinerary lives at GET /share/:token."),
      entry("devops", "Liveness is GET /healthz and readiness is GET /readyz."),
      entry("frontend", "Silent refresh uses POST /auth/refresh."),
    ]);

    assert.deepEqual(
      surface.map((item) => `${item.method} ${item.path}`),
      [
        "GET /share/:token",
        "GET /healthz",
        "GET /readyz",
        "POST /auth/refresh",
      ],
    );
  });

  it("skips endpoints flagged for later or future versions", () => {
    const surface = extractDeclaredApiSurface([
      entry("backend", "v1 reads use GET /api/trips/:id."),
      entry(
        "frontend",
        "I flag it for `GET /api/trips` later; v1 stays on the by-id route.",
      ),
      entry("devops", "A future v2 POST /api/trips/import stays out of scope."),
    ]);

    assert.deepEqual(
      surface.map((item) => `${item.method} ${item.path}`),
      ["GET /api/trips/:id"],
    );
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
