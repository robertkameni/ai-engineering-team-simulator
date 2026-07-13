import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isFrontendDeliverableInsufficient } from "@/ai/orchestration/agent-deliverable-quality";

describe("isFrontendDeliverableInsufficient", () => {
  it("flags missing Frontend Risks section", () => {
    const text = "## UI & Routing\n\nRoutes.\n\n## Component Architecture\n\nTaskChecklist.";
    assert.equal(isFrontendDeliverableInsufficient(text), true);
  });

  it("accepts complete frontend deliverable with risks section", () => {
    const text = `## UI & Routing

Server and client route groups with nested layouts, loading states, and error boundaries for onboarding and dashboard views.

## Key Flows & UX

Magic-link onboarding from email click through welcome form to personalized checklist with under-two-second time to first value.

## State Management

Polling intervals, optimistic rollback rules, and auth refresh coalescing for concurrent 401 responses.

## Component Architecture

TaskChecklist, DocumentUploader, and WelcomeForm with explicit props and client/server boundaries.

## Frontend Risks

CLS mitigated with skeleton placeholders. Keyboard navigation uses visible focus rings and aria labels on every interactive control.`;

    assert.equal(isFrontendDeliverableInsufficient(text), false);
  });
});
