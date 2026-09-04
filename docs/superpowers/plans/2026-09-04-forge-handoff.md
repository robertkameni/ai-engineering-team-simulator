# Open in Forge Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated users start an Engineering Forge Spec Kit job from a Team Sim run via a primary **Open in Forge** button (live + saved), using a server-side partner ingest proxy.

**Architecture:** Client POSTs only `runId` to `POST /api/runs/[id]/forge-handoff`. Server authenticates, rate-limits (`forge_handoff`), loads the owned run, gates with `canExportApprovedRun`, builds markdown via `buildRunMarkdown` (no export-id footer), POSTs to Forge `POST /api/partner/ingest` with a shared bearer secret, and returns `{ trackerUrl }`. UI opens a blank tab synchronously then navigates to `trackerUrl`. Guests see the button and get `ExportAuthModal`.

**Tech Stack:** Next.js 16 App Router, React 19, Zod, Upstash rate limits, `node:test` + `tsx`, existing export/ownership helpers.

**Spec:** `docs/superpowers/specs/2026-09-03-forge-handoff-design.md`  
**Peer (must be live or mocked):** Forge `specs/002-partner-ingest/design.md`

## Global Constraints

- Never send `FORGE_PARTNER_SECRET` or full markdown to the client or logs.
- Forbidden run access → **404** `{ error: "Run not found" }` (no IDOR oracle).
- Client never invents `/?job=` — only open Forge’s `trackerUrl`.
- Handoff markdown must **not** append `<!-- export-id: … -->`.
- `forge_handoff` is a dedicated hourly bucket (default auth **5**/hour); do not reuse `export_pdf`.
- Tests: `node --import tsx --test <paths>` — never vitest/jest.
- Origin CSRF for mutating requests is enforced in `src/proxy.ts` via `isAllowedOrigin`; do not duplicate unless a sibling route already does.

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/lib/rate-limit-config.ts` | Add `forge_handoff` action + defaults/env keys |
| `src/lib/forge/forge-config.ts` | Typed `FORGE_BASE_URL` + `FORGE_PARTNER_SECRET` reader |
| `src/lib/forge/submit-partner-ingest.ts` | Server `fetch` to Forge partner ingest |
| `src/lib/forge/forge-handoff-errors.ts` | Typed error classes / codes for mapping |
| `src/lib/api/forge-handoff-logic.ts` | Injectable handoff orchestration (test seam) |
| `src/lib/api/handle-forge-handoff-post.ts` | Wire real deps into logic |
| `src/app/api/runs/[id]/forge-handoff/route.ts` | HTTP entry |
| `src/features/workspace/open-in-forge-button.tsx` | Client button + auth modal + blank-tab flow |
| `src/features/workspace/saved-run-footer.tsx` | Place button next to Rerun |
| `src/features/workspace/saved-run-workspace.tsx` | Pass `runId` + `isAuthenticated` |
| `src/features/simulation/prompt-composer-types.ts` | Optional forge props on composer |
| `src/features/simulation/prompt-composer.tsx` | Desktop Forge row when `runId` set |
| `src/features/simulation/prompt-composer-mobile-sheet.tsx` | Mobile Forge control parity |
| `src/features/workspace/simulation-workspace.tsx` | Pass `runId` + auth into composer |
| `src/test/security/forge-handoff-rate-limit.test.ts` | Rate-limit config + logic 429 |
| `src/test/security/forge-handoff-access.test.ts` | Auth / ownership / eligibility / happy path |
| `src/test/lib/forge/submit-partner-ingest.test.ts` | Forge client parsing |
| `AGENTS.md` | Document env + rate-limit bucket |

---

### Task 1: Rate limit — `forge_handoff`

**Files:**
- Modify: `src/lib/rate-limit-config.ts`
- Modify: `src/test/security/rate-limit-actions.test.ts`
- Test: `src/test/security/rate-limit-actions.test.ts`

**Interfaces:**
- Consumes: existing `RateLimitAction` / `getRateLimitThreshold`
- Produces: `RateLimitAction` includes `"forge_handoff"`; auth default **5**, guest default **5** (unused in practice; keep Record shape satisfied)

- [ ] **Step 1: Write the failing test**

Add to `src/test/security/rate-limit-actions.test.ts`:

```typescript
it("sets forge_handoff to default 5 for authenticated profiles when env is unset", () => {
  const saved = process.env.RATE_LIMIT_FORGE_HANDOFF_AUTH;
  delete process.env.RATE_LIMIT_FORGE_HANDOFF_AUTH;
  try {
    assert.equal(getRateLimitThreshold("forge_handoff", true), 5);
  } finally {
    if (saved !== undefined) process.env.RATE_LIMIT_FORGE_HANDOFF_AUTH = saved;
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/test/security/rate-limit-actions.test.ts`

Expected: FAIL — `"forge_handoff"` not assignable / threshold lookup throws or type error at compile; under `tsx` typically runtime KeyError or undefined → assert fail.

- [ ] **Step 3: Implement rate-limit config**

In `src/lib/rate-limit-config.ts`:

1. Add `"forge_handoff"` to `RateLimitAction`.
2. Defaults: `{ guest: 5, auth: 5 }`.
3. Env keys:
   - guest: `RATE_LIMIT_FORGE_HANDOFF_GUEST`
   - auth: `RATE_LIMIT_FORGE_HANDOFF_AUTH`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/test/security/rate-limit-actions.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit-config.ts src/test/security/rate-limit-actions.test.ts
git commit -m "$(cat <<'EOF'
feat: add forge_handoff rate-limit bucket

EOF
)"
```

---

### Task 2: Forge config + partner ingest client

**Files:**
- Create: `src/lib/forge/forge-config.ts`
- Create: `src/lib/forge/forge-handoff-errors.ts`
- Create: `src/lib/forge/submit-partner-ingest.ts`
- Create: `src/test/lib/forge/submit-partner-ingest.test.ts`

**Interfaces:**
- Consumes: `process.env.FORGE_BASE_URL`, `process.env.FORGE_PARTNER_SECRET`
- Produces:
  - `getForgePartnerConfig(): { baseUrl: string; partnerSecret: string } | null`
  - `submitPartnerIngest(input: { markdown: string; sourceFilename: string; fetchImpl?: typeof fetch }): Promise<{ trackerUrl: string; jobId: string }>`
  - `ForgePartnerError` with `statusCode` + `code`

- [ ] **Step 1: Write the failing tests**

Create `src/test/lib/forge/submit-partner-ingest.test.ts`:

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ForgePartnerError } from "../../../lib/forge/forge-handoff-errors.js";
import { submitPartnerIngest } from "../../../lib/forge/submit-partner-ingest.js";

describe("submitPartnerIngest", () => {
  it("returns trackerUrl from a 202 partner response", async () => {
    const result = await submitPartnerIngest({
      markdown: "# Hello",
      sourceFilename: "run.md",
      baseUrl: "https://forge.example",
      partnerSecret: "test-secret-at-least-32-chars-long!!",
      fetchImpl: async (input, init) => {
        assert.equal(String(input), "https://forge.example/api/partner/ingest");
        assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-secret-at-least-32-chars-long!!");
        assert.equal(init?.method, "POST");
        return new Response(
          JSON.stringify({
            jobId: "550e8400-e29b-41d4-a716-446655440000",
            status: "PENDING",
            statusLabel: "Pending",
            statusUrl: "https://forge.example/api/jobs/550e8400-e29b-41d4-a716-446655440000",
            trackerUrl: "https://forge.example/?job=550e8400-e29b-41d4-a716-446655440000",
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    assert.equal(
      result.trackerUrl,
      "https://forge.example/?job=550e8400-e29b-41d4-a716-446655440000",
    );
    assert.equal(result.jobId, "550e8400-e29b-41d4-a716-446655440000");
  });

  it("throws ForgePartnerError on non-OK responses without leaking the secret", async () => {
    await assert.rejects(
      () =>
        submitPartnerIngest({
          markdown: "# Hello",
          sourceFilename: "run.md",
          baseUrl: "https://forge.example",
          partnerSecret: "test-secret-at-least-32-chars-long!!",
          fetchImpl: async () =>
            new Response(JSON.stringify({ code: "UNAUTHORIZED", message: "nope" }), {
              status: 401,
            }),
        }),
      (error: unknown) => {
        assert.ok(error instanceof ForgePartnerError);
        assert.equal(error.statusCode, 401);
        assert.equal(error.code, "UNAUTHORIZED");
        assert.equal(String(error.message).includes("test-secret"), false);
        return true;
      },
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test src/test/lib/forge/submit-partner-ingest.test.ts`

Expected: FAIL — modules not found

- [ ] **Step 3: Implement errors, config, client**

`src/lib/forge/forge-handoff-errors.ts`:

```typescript
export class ForgePartnerError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "ForgePartnerError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ForgeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForgeConfigError";
  }
}
```

`src/lib/forge/forge-config.ts`:

```typescript
import "server-only";

export type ForgePartnerConfig = {
  readonly baseUrl: string;
  readonly partnerSecret: string;
};

function trimEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

/** Returns null when either var is missing (caller maps to 503). */
export function getForgePartnerConfig(): ForgePartnerConfig | null {
  const baseUrl = trimEnv("FORGE_BASE_URL")?.replace(/\/$/, "") ?? null;
  const partnerSecret = trimEnv("FORGE_PARTNER_SECRET");
  if (!baseUrl || !partnerSecret) {
    return null;
  }
  return { baseUrl, partnerSecret };
}
```

`src/lib/forge/submit-partner-ingest.ts`:

```typescript
import "server-only";

import { z } from "zod";

import { ForgePartnerError } from "@/lib/forge/forge-handoff-errors";

const partnerAcceptedSchema = z.object({
  jobId: z.string().uuid(),
  trackerUrl: z.string().url(),
});

export type SubmitPartnerIngestInput = {
  readonly markdown: string;
  readonly sourceFilename: string;
  readonly baseUrl: string;
  readonly partnerSecret: string;
  readonly fetchImpl?: typeof fetch;
};

export type SubmitPartnerIngestResult = {
  readonly jobId: string;
  readonly trackerUrl: string;
};

export async function submitPartnerIngest(
  input: SubmitPartnerIngestInput,
): Promise<SubmitPartnerIngestResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${input.baseUrl.replace(/\/$/, "")}/api/partner/ingest`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.partnerSecret}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        markdown: input.markdown,
        sourceFilename: input.sourceFilename,
      }),
    },
  );

  const rawText = await response.text();
  let payload: unknown = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = null;
  }

  if (response.status !== 202) {
    const code =
      payload &&
      typeof payload === "object" &&
      "code" in payload &&
      typeof (payload as { code: unknown }).code === "string"
        ? (payload as { code: string }).code
        : "FORGE_REQUEST_FAILED";
    throw new ForgePartnerError(
      response.status,
      code,
      "Could not start Forge pipeline",
    );
  }

  const parsed = partnerAcceptedSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ForgePartnerError(
      502,
      "INVALID_FORGE_RESPONSE",
      "Could not start Forge pipeline",
    );
  }

  return {
    jobId: parsed.data.jobId,
    trackerUrl: parsed.data.trackerUrl,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test src/test/lib/forge/submit-partner-ingest.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/forge src/test/lib/forge
git commit -m "$(cat <<'EOF'
feat: add Forge partner ingest client

EOF
)"
```

---

### Task 3: Handoff orchestration logic (DI + security tests)

**Files:**
- Create: `src/lib/api/forge-handoff-logic.ts`
- Create: `src/test/security/forge-handoff-access.test.ts`
- Create: `src/test/security/forge-handoff-rate-limit.test.ts`

**Interfaces:**
- Consumes: `getForgePartnerConfig`, `submitPartnerIngest`, `buildRunMarkdown`, `buildRunMarkdownFilename`, `canExportApprovedRun`, `getRunForWorkspaceIfOwned`, `getTeamRoster`, `assertRateLimit`, `requireAuthenticatedExportSession` pattern
- Produces: `executeForgeHandoffPost(request, runId, hooks): Promise<Response>` returning **200** `{ trackerUrl }`

- [ ] **Step 1: Write failing security tests**

`src/test/security/forge-handoff-access.test.ts`:

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  executeForgeHandoffPost,
  type ForgeHandoffHooks,
} from "../../lib/api/forge-handoff-logic.js";
import { rateLimitResponse } from "@/lib/rate-limit-response";

function baseHooks(overrides: Partial<ForgeHandoffHooks> = {}): ForgeHandoffHooks {
  return {
    requireAuthenticatedUserId: async () => ({ ok: true as const, userId: "user-1" }),
    assertRateLimit: async () => ({ ok: true as const }),
    rateLimitResponse,
    getOwnedRun: async () => ({
      id: "run-1",
      title: "Demo",
      debateOutcome: "approved" as const,
      artifacts: {
        requirements: [{ id: "1", title: "a", description: "b" }],
        architecture: [{ id: "1", title: "a", description: "b" }],
        blueprint: [{ id: "1", title: "a", description: "b" }],
        implementation: [{ id: "1", title: "a", description: "b" }],
        review: [{ id: "1", title: "a", description: "b" }],
      },
      // Include only fields the logic reads; cast if MockRun is required
    }) as never,
    getTeamRosterTemplateId: async () => "software" as const,
    canExportApprovedRun: () => true,
    buildMarkdown: () => "# brief",
    buildFilename: () => "demo.md",
    getForgeConfig: () => ({
      baseUrl: "https://forge.example",
      partnerSecret: "test-secret-at-least-32-chars-long!!",
    }),
    submitPartnerIngest: async () => ({
      jobId: "550e8400-e29b-41d4-a716-446655440000",
      trackerUrl: "https://forge.example/?job=550e8400-e29b-41d4-a716-446655440000",
    }),
    ...overrides,
  };
}

describe("executeForgeHandoffPost access", () => {
  it("returns 401 when unauthenticated and does not call Forge", async () => {
    let forgeCalled = false;
    const response = await executeForgeHandoffPost(
      new Request("http://localhost/api/runs/run-1/forge-handoff", { method: "POST" }),
      "run-1",
      baseHooks({
        requireAuthenticatedUserId: async () => ({
          ok: false as const,
          response: Response.json({ error: "Authentication required" }, { status: 401 }),
        }),
        submitPartnerIngest: async () => {
          forgeCalled = true;
          return { jobId: "x", trackerUrl: "https://forge.example/?job=x" };
        },
      }),
    );
    assert.equal(response.status, 401);
    assert.equal(forgeCalled, false);
  });

  it("returns 404 when the run is missing and does not call Forge", async () => {
    let forgeCalled = false;
    const response = await executeForgeHandoffPost(
      new Request("http://localhost/api/runs/run-1/forge-handoff", { method: "POST" }),
      "run-1",
      baseHooks({
        getOwnedRun: async () => null,
        submitPartnerIngest: async () => {
          forgeCalled = true;
          return { jobId: "x", trackerUrl: "https://forge.example/?job=x" };
        },
      }),
    );
    assert.equal(response.status, 404);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, "Run not found");
    assert.equal(forgeCalled, false);
  });

  it("returns 409 when export gate fails", async () => {
    const response = await executeForgeHandoffPost(
      new Request("http://localhost/api/runs/run-1/forge-handoff", { method: "POST" }),
      "run-1",
      baseHooks({ canExportApprovedRun: () => false }),
    );
    assert.equal(response.status, 409);
  });

  it("returns 200 with trackerUrl on success", async () => {
    const response = await executeForgeHandoffPost(
      new Request("http://localhost/api/runs/run-1/forge-handoff", { method: "POST" }),
      "run-1",
      baseHooks(),
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { trackerUrl: string };
    assert.equal(
      body.trackerUrl,
      "https://forge.example/?job=550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("returns 503 when Forge config is missing", async () => {
    const response = await executeForgeHandoffPost(
      new Request("http://localhost/api/runs/run-1/forge-handoff", { method: "POST" }),
      "run-1",
      baseHooks({ getForgeConfig: () => null }),
    );
    assert.equal(response.status, 503);
  });
});
```

`src/test/security/forge-handoff-rate-limit.test.ts`:

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { executeForgeHandoffPost } from "../../lib/api/forge-handoff-logic.js";
import { rateLimitResponse } from "@/lib/rate-limit-response";

describe("executeForgeHandoffPost rate limiting", () => {
  it("returns 429 and skips Forge when rate limit is exceeded", async () => {
    let forgeCalled = false;
    const response = await executeForgeHandoffPost(
      new Request("http://localhost/api/runs/run-1/forge-handoff", { method: "POST" }),
      "run-1",
      {
        requireAuthenticatedUserId: async () => ({ ok: true as const, userId: "user-1" }),
        assertRateLimit: async () => ({
          ok: false as const,
          status: 429 as const,
          retryAfterSec: 60,
          error: "Rate limit exceeded",
        }),
        rateLimitResponse,
        getOwnedRun: async () => null,
        getTeamRosterTemplateId: async () => null,
        canExportApprovedRun: () => true,
        buildMarkdown: () => "",
        buildFilename: () => "x.md",
        getForgeConfig: () => null,
        submitPartnerIngest: async () => {
          forgeCalled = true;
          return { jobId: "x", trackerUrl: "https://forge.example/?job=x" };
        },
      },
    );
    assert.equal(response.status, 429);
    assert.equal(forgeCalled, false);
  });
});
```

Adjust artifact fixture shapes to match `MockRun` / `canExportApprovedRun` inputs used in the real logic (inspect `artifact-panel-phase` and `getRunForWorkspaceIfOwned` return type while implementing — keep tests compiling).

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --import tsx --test src/test/security/forge-handoff-access.test.ts src/test/security/forge-handoff-rate-limit.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement `executeForgeHandoffPost`**

`src/lib/api/forge-handoff-logic.ts`:

```typescript
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { RateLimitResult } from "@/lib/rate-limit-config";
import type { ForgePartnerConfig } from "@/lib/forge/forge-config";
import type { SubmitPartnerIngestResult } from "@/lib/forge/submit-partner-ingest";
import { ForgePartnerError } from "@/lib/forge/forge-handoff-errors";
import type { MockRun } from "@/lib/types";

export type ForgeHandoffAuth =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

export type ForgeHandoffHooks = {
  requireAuthenticatedUserId: () => Promise<ForgeHandoffAuth>;
  assertRateLimit: (
    request: Request,
    action: "forge_handoff",
    userId: string | null,
  ) => Promise<RateLimitResult>;
  rateLimitResponse: (result: Extract<RateLimitResult, { ok: false }>) => Response;
  getOwnedRun: (runId: string, userId: string) => Promise<MockRun | null>;
  getTeamRosterTemplateId: (runId: string) => Promise<TeamTemplateId | null>;
  canExportApprovedRun: (params: {
    debateOutcome: MockRun["debateOutcome"];
    artifacts: MockRun["artifacts"];
  }) => boolean;
  buildMarkdown: (run: MockRun, templateId?: TeamTemplateId) => string;
  buildFilename: (title: string, exportId: string) => string;
  getForgeConfig: () => ForgePartnerConfig | null;
  submitPartnerIngest: (input: {
    markdown: string;
    sourceFilename: string;
    baseUrl: string;
    partnerSecret: string;
  }) => Promise<SubmitPartnerIngestResult>;
};

function mapForgePartnerFailure(error: ForgePartnerError): Response {
  if (error.statusCode === 429) {
    return Response.json(
      { error: "Forge is busy. Try again shortly." },
      { status: 429 },
    );
  }
  if (error.statusCode === 503) {
    return Response.json(
      { error: "Forge is temporarily unavailable." },
      { status: 503 },
    );
  }
  return Response.json(
    { error: "Could not start Forge pipeline" },
    { status: error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502 },
  );
}

export async function executeForgeHandoffPost(
  request: Request,
  runId: string,
  hooks: ForgeHandoffHooks,
): Promise<Response> {
  const auth = await hooks.requireAuthenticatedUserId();
  if (!auth.ok) {
    return auth.response;
  }

  const rateLimit = await hooks.assertRateLimit(
    request,
    "forge_handoff",
    auth.userId,
  );
  if (!rateLimit.ok) {
    return hooks.rateLimitResponse(rateLimit);
  }

  const run = await hooks.getOwnedRun(runId, auth.userId);
  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  if (
    !hooks.canExportApprovedRun({
      debateOutcome: run.debateOutcome,
      artifacts: run.artifacts,
    })
  ) {
    return Response.json(
      {
        error:
          "Artifacts are not ready for this approved run. Wait for synthesis to finish, then retry.",
      },
      { status: 409 },
    );
  }

  const config = hooks.getForgeConfig();
  if (!config) {
    return Response.json(
      { error: "Forge handoff is not configured" },
      { status: 503 },
    );
  }

  const templateId = (await hooks.getTeamRosterTemplateId(runId)) ?? undefined;
  const markdown = hooks.buildMarkdown(run, templateId);
  const sourceFilename = hooks.buildFilename(run.title, crypto.randomUUID());

  try {
    const accepted = await hooks.submitPartnerIngest({
      markdown,
      sourceFilename,
      baseUrl: config.baseUrl,
      partnerSecret: config.partnerSecret,
    });
    return Response.json({ trackerUrl: accepted.trackerUrl });
  } catch (error) {
    if (error instanceof ForgePartnerError) {
      return mapForgePartnerFailure(error);
    }
    return Response.json(
      { error: "Could not start Forge pipeline" },
      { status: 502 },
    );
  }
}
```

Fix test fixtures so `getOwnedRun` returns a minimal valid `MockRun` (copy a compact fixture from an existing export test if needed).

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
node --import tsx --test src/test/security/forge-handoff-access.test.ts src/test/security/forge-handoff-rate-limit.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/forge-handoff-logic.ts src/test/security/forge-handoff-access.test.ts src/test/security/forge-handoff-rate-limit.test.ts
git commit -m "$(cat <<'EOF'
feat: add forge handoff orchestration with security tests

EOF
)"
```

---

### Task 4: HTTP route + real dependency wiring

**Files:**
- Create: `src/lib/api/handle-forge-handoff-post.ts`
- Create: `src/app/api/runs/[id]/forge-handoff/route.ts`

**Interfaces:**
- Consumes: `executeForgeHandoffPost`, `requireAuthenticatedExportSession`, `assertRateLimit`, `getRunForWorkspaceIfOwned`, `getTeamRoster`, `buildRunMarkdown`, `buildRunMarkdownFilename`, `canExportApprovedRun`, `getForgePartnerConfig`, `submitPartnerIngest`
- Produces: `POST /api/runs/[id]/forge-handoff`

- [ ] **Step 1: Implement handler wiring**

`src/lib/api/handle-forge-handoff-post.ts`:

```typescript
import "server-only";

import { canExportApprovedRun } from "@/features/artifacts/artifact-panel-phase";
import { executeForgeHandoffPost } from "@/lib/api/forge-handoff-logic";
import { getTeamRoster } from "@/lib/db/team-roster";
import { getRunForWorkspaceIfOwned } from "@/lib/db/runs";
import { buildRunMarkdown } from "@/lib/export/build-run-export-document";
import { buildRunMarkdownFilename } from "@/lib/export/export-filename";
import { requireAuthenticatedExportSession } from "@/lib/export/require-authenticated-export-session";
import { getForgePartnerConfig } from "@/lib/forge/forge-config";
import { submitPartnerIngest } from "@/lib/forge/submit-partner-ingest";
import { assertRateLimit } from "@/lib/rate-limit";
import { rateLimitResponse } from "@/lib/rate-limit-response";

export async function handleForgeHandoffPost(
  request: Request,
  runId: string,
): Promise<Response> {
  return executeForgeHandoffPost(request, runId, {
    requireAuthenticatedUserId: async () => {
      const session = await requireAuthenticatedExportSession();
      if (!session.ok) {
        return {
          ok: false,
          response: Response.json(
            { error: "Authentication required to open Forge" },
            { status: 401 },
          ),
        };
      }
      return { ok: true, userId: session.userId };
    },
    assertRateLimit,
    rateLimitResponse,
    getOwnedRun: async (id, userId) =>
      getRunForWorkspaceIfOwned(id, { userId, guestSessionId: null }),
    getTeamRosterTemplateId: async (id) => {
      const roster = await getTeamRoster(id);
      return roster?.templateId ?? null;
    },
    canExportApprovedRun,
    buildMarkdown: (run, templateId) => buildRunMarkdown({ run, templateId }),
    buildFilename: buildRunMarkdownFilename,
    getForgeConfig: getForgePartnerConfig,
    submitPartnerIngest,
  });
}
```

`src/app/api/runs/[id]/forge-handoff/route.ts`:

```typescript
import { handleForgeHandoffPost } from "@/lib/api/handle-forge-handoff-post";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  return handleForgeHandoffPost(request, id);
}
```

- [ ] **Step 2: Typecheck touched API surface**

Run: `npx tsc --noEmit`

Expected: no errors in new forge-handoff files (fix any type mismatches in fixtures/hooks first)

- [ ] **Step 3: Re-run security tests**

Run:

```bash
node --import tsx --test src/test/security/forge-handoff-access.test.ts src/test/security/forge-handoff-rate-limit.test.ts src/test/lib/forge/submit-partner-ingest.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/api/handle-forge-handoff-post.ts src/app/api/runs/[id]/forge-handoff/route.ts
git commit -m "$(cat <<'EOF'
feat: expose POST /api/runs/[id]/forge-handoff

EOF
)"
```

---

### Task 5: Shared `OpenInForgeButton` client control

**Files:**
- Create: `src/features/workspace/open-in-forge-button.tsx`

**Interfaces:**
- Consumes: `ExportAuthModal` (`open`, `onOpenChange`, `onAuthSuccess`), `Button`, `POST /api/runs/${runId}/forge-handoff`
- Produces: `OpenInForgeButton({ runId, isAuthenticated, disabled?: boolean, className?: string })`

- [ ] **Step 1: Implement the button**

```tsx
"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ExportAuthModal } from "@/features/workspace/export-auth-modal";
import { cn } from "@/lib/utils";

type OpenInForgeButtonProps = {
  readonly runId: string;
  readonly isAuthenticated?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
};

type HandoffSuccessBody = {
  readonly trackerUrl: string;
};

async function claimGuestRuns(): Promise<void> {
  try {
    await fetch("/api/auth/claim-guest-runs", { method: "POST" });
  } catch {
    // non-blocking; mirror export button
  }
}

export function OpenInForgeButton({
  runId,
  isAuthenticated = false,
  disabled = false,
  className,
}: OpenInForgeButtonProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingAfterAuth, setPendingAfterAuth] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startHandoff = useCallback(async () => {
    setError(null);
    setIsPending(true);
    const blankTab = window.open("about:blank", "_blank", "noopener,noreferrer");

    try {
      const response = await fetch(`/api/runs/${runId}/forge-handoff`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | HandoffSuccessBody
        | { error?: string }
        | null;

      if (!response.ok) {
        blankTab?.close();
        setError(
          payload && "error" in payload && payload.error
            ? payload.error
            : "Could not start Forge pipeline",
        );
        return;
      }

      if (!payload || !("trackerUrl" in payload) || !payload.trackerUrl) {
        blankTab?.close();
        setError("Could not start Forge pipeline");
        return;
      }

      if (blankTab) {
        blankTab.location.href = payload.trackerUrl;
      } else {
        window.open(payload.trackerUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      blankTab?.close();
      setError("Could not start Forge pipeline");
    } finally {
      setIsPending(false);
    }
  }, [runId]);

  const handleClick = useCallback(() => {
    if (disabled || isPending) {
      return;
    }
    if (!isAuthenticated) {
      setPendingAfterAuth(true);
      setModalOpen(true);
      return;
    }
    void startHandoff();
  }, [disabled, isAuthenticated, isPending, startHandoff]);

  const handleAuthSuccess = useCallback(async () => {
    await claimGuestRuns();
    router.refresh();
    setModalOpen(false);
    if (pendingAfterAuth) {
      setPendingAfterAuth(false);
      await startHandoff();
    }
  }, [pendingAfterAuth, router, startHandoff]);

  return (
    <div className={cn("flex flex-col items-stretch gap-1", className)}>
      <Button
        type="button"
        className="gap-2"
        disabled={disabled || isPending}
        onClick={handleClick}
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <ExternalLink className="size-4" aria-hidden />
        )}
        {isPending ? "Opening Forge…" : "Open in Forge"}
      </Button>
      {error ? (
        <p className="text-center text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <ExportAuthModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) {
            setPendingAfterAuth(false);
          }
        }}
        onAuthSuccess={handleAuthSuccess}
      />
    </div>
  );
}
```

`ExportAuthModal` props are `open`, `onOpenChange`, `onAuthSuccess` (see `export-auth-modal.tsx`).

- [ ] **Step 2: Lint the new file**

Run: `npx eslint src/features/workspace/open-in-forge-button.tsx`

Expected: clean (or only pre-existing project noise)

- [ ] **Step 3: Commit**

```bash
git add src/features/workspace/open-in-forge-button.tsx
git commit -m "$(cat <<'EOF'
feat: add Open in Forge client button

EOF
)"
```

---

### Task 6: Wire saved-run footer

**Files:**
- Modify: `src/features/workspace/saved-run-footer.tsx`
- Modify: `src/features/workspace/saved-run-workspace.tsx`

**Interfaces:**
- Consumes: `OpenInForgeButton`
- Produces: Footer shows Rerun (outline/asChild link) + primary Open in Forge when `runId` present

- [ ] **Step 1: Update footer**

Because `OpenInForgeButton` is a client component, keep footer as a thin client wrapper **or** leave footer as server component that renders the client button as a child (allowed). Prefer making `saved-run-footer.tsx` a client module if it must hold layout state; otherwise:

```tsx
import Link from "next/link";
import { Plus, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OpenInForgeButton } from "@/features/workspace/open-in-forge-button";
import {
  hasWorkspacePrompt,
  workspaceUrlForRerun,
} from "@/lib/workspace-url";

interface SavedRunFooterProps {
  userPrompt?: string;
  runId: string;
  isAuthenticated?: boolean;
}

export function SavedRunFooter({
  userPrompt,
  runId,
  isAuthenticated = false,
}: SavedRunFooterProps) {
  const canRerun = hasWorkspacePrompt(userPrompt);

  return (
    <footer className="@container/composer glass-panel hidden h-21 shrink-0 items-center justify-center border-t-0 border-glass-border min-[720px]:flex">
      <div className="flex w-full max-w-3xl flex-col items-stretch justify-center gap-2 px-3 @md/composer:flex-row @md/composer:items-center">
        <Button asChild variant="outline" className="gap-2">
          <Link
            href={
              canRerun ? workspaceUrlForRerun(userPrompt!) : "/workspace"
            }
          >
            {canRerun ? (
              <RotateCw className="size-4" aria-hidden />
            ) : (
              <Plus className="size-4" aria-hidden />
            )}
            {canRerun ? "Rerun simulation" : "New simulation"}
          </Link>
        </Button>
        <OpenInForgeButton runId={runId} isAuthenticated={isAuthenticated} />
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Pass props from `SavedRunWorkspace`**

In `saved-run-workspace.tsx`, change:

```tsx
<SavedRunFooter
  userPrompt={run.userPrompt}
  runId={run.id}
  isAuthenticated={isAuthenticated}
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/features/workspace/saved-run-footer.tsx src/features/workspace/saved-run-workspace.tsx
git commit -m "$(cat <<'EOF'
feat: show Open in Forge on saved-run footer

EOF
)"
```

---

### Task 7: Wire live PromptComposer (+ mobile)

**Files:**
- Modify: `src/features/simulation/prompt-composer-types.ts`
- Modify: `src/features/simulation/prompt-composer.tsx`
- Modify: `src/features/simulation/prompt-composer-mobile-sheet.tsx`
- Modify: `src/features/workspace/simulation-workspace.tsx`
- Note: `SimulationWorkspace` already accepts `isAuthenticated` from `src/app/workspace/page.tsx`

**Interfaces:**
- Consumes: `OpenInForgeButton`
- Produces: When `runId` is set and live workspace is active, show Forge button next to Rerun; hide while `disabled` (running) or when `runId` is null

- [ ] **Step 1: Extend composer props**

In `prompt-composer-types.ts` add:

```typescript
export type PromptComposerProps = {
  // ...existing
  readonly runId?: string | null;
  readonly isAuthenticated?: boolean;
};
```

Pass through mobile sheet props similarly if the Forge control is shown inside the sheet.

- [ ] **Step 2: Desktop UI in `prompt-composer.tsx`**

Replace the single full-width Rerun block with a row when `runId` is present:

```tsx
{derived.isLiveWorkspace && (
  <div className="flex w-full flex-col gap-2 @md/composer:flex-row">
    <Button
      type="button"
      variant="outline"
      className="w-full flex-1 gap-2"
      disabled={!derived.canRerun}
      onClick={() => handleRerun()}
    >
      <RotateCw className="size-4" />
      {disabled ? "Simulation running…" : "Rerun simulation"}
    </Button>
    {runId ? (
      <OpenInForgeButton
        runId={runId}
        isAuthenticated={isAuthenticated}
        disabled={disabled}
        className="w-full flex-1"
      />
    ) : null}
  </div>
)}
```

Import `OpenInForgeButton` and accept new props on `PromptComposer`.

- [ ] **Step 3: Mobile sheet parity**

Add the same Forge button under the form actions in `prompt-composer-mobile-sheet.tsx` when `runId` is set (pass props from composer). Do not put Forge on the FAB itself — keep FAB = open sheet.

- [ ] **Step 4: Thread props from `simulation-workspace.tsx`**

```tsx
<PromptComposer
  // ...existing
  runId={runId}
  isAuthenticated={isAuthenticated}
  runSession={promptRunSession}
/>
```

`SimulationWorkspace` already has `isAuthenticated` — pass it through to `PromptComposer` with `runId`. No page.tsx change required unless a call site is missing the prop (workspace page already passes it).

- [ ] **Step 5: Smoke typecheck**

Run: `npx tsc --noEmit`

Expected: PASS for new props wiring

- [ ] **Step 6: Commit**

```bash
git add src/features/simulation/prompt-composer-types.ts src/features/simulation/prompt-composer.tsx src/features/simulation/prompt-composer-mobile-sheet.tsx src/features/workspace/simulation-workspace.tsx
# plus any page.tsx callers updated for isAuthenticated
git commit -m "$(cat <<'EOF'
feat: show Open in Forge on live simulation composer

EOF
)"
```

---

### Task 8: Docs + env examples

**Files:**
- Modify: `AGENTS.md` (rate-limit table + env blurb)
- Modify: `.env.example` if present (else skip and document only in AGENTS.md)

**Interfaces:**
- Produces: discoverable `FORGE_BASE_URL`, `FORGE_PARTNER_SECRET`, `RATE_LIMIT_FORGE_HANDOFF_AUTH`

- [ ] **Step 1: Update AGENTS.md**

In the rate-limit bullet, append:

`forge_handoff` (auth 5/hour) on `POST /api/runs/[id]/forge-handoff`.

In the Env bullet, append:

`FORGE_BASE_URL`, `FORGE_PARTNER_SECRET` (Open in Forge handoff); optional `RATE_LIMIT_FORGE_HANDOFF_AUTH`.

If `.env.example` exists, add:

```bash
# Engineering Forge partner handoff (server-only)
FORGE_BASE_URL=https://forge.lucastar.de
FORGE_PARTNER_SECRET=
# RATE_LIMIT_FORGE_HANDOFF_AUTH=5
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md .env.example
git commit -m "$(cat <<'EOF'
docs: document Forge handoff env and rate limit

EOF
)"
```

---

### Task 9: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run all new/related tests**

```bash
node --import tsx --test \
  src/test/security/rate-limit-actions.test.ts \
  src/test/security/forge-handoff-access.test.ts \
  src/test/security/forge-handoff-rate-limit.test.ts \
  src/test/lib/forge/submit-partner-ingest.test.ts
```

Expected: all PASS

- [ ] **Step 2: Typecheck + lint touched areas**

```bash
npx tsc --noEmit
npm run lint
```

Expected: PASS (or only pre-existing unrelated warnings)

- [ ] **Step 3: Manual checklist (when Forge peer is ready)**

1. Set `FORGE_BASE_URL` + matching `FORGE_PARTNER_SECRET` in `.env.local`.
2. Sign in, open a saved approved run with artifacts → **Open in Forge** → new tab shows Forge Track with `?job=`.
3. Guest → button opens auth modal; after login, handoff proceeds.
4. Approved run mid-synthesis → 409 message under button.
5. Confirm Rerun remains outline; Forge is primary.

- [ ] **Step 4: No further commit unless docs/tests were fixed in this task**

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Server proxy to partner ingest | 2, 3, 4 |
| `trackerUrl` only | 2, 3, 5 |
| Auth + ExportAuthModal for guests | 3, 5 |
| Ownership 404 | 3 |
| `canExportApprovedRun` 409 | 3 |
| Dedicated `forge_handoff` limit | 1, 3 |
| No export-id in markdown | 3 (`buildMarkdown` = `buildRunMarkdown` only) |
| Live + saved surfaces | 6, 7 |
| New tab / blank-tab pattern | 5 |
| Env docs | 8 |
| Security tests | 1–3, 9 |

## Placeholder / consistency check

- No TBD steps.
- `executeForgeHandoffPost` / `ForgeHandoffHooks` names consistent across Tasks 3–4.
- `submitPartnerIngest` accepts injected `baseUrl`/`partnerSecret` for tests; production wiring passes config from `getForgePartnerConfig`.

## Peer dependency note

Team Sim handoff **requires** Forge `POST /api/partner/ingest` + `trackerUrl` (Forge `002-partner-ingest`). Until Forge ships, keep Forge client unit-tested with mocks; end-to-end smoke is Task 9 Step 3.
