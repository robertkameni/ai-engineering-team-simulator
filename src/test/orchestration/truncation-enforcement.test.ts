import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getLatestTruncatedCriticalRoles,
  hasCurrentCriticalTruncation,
  syncHasTruncatedCriticalTurn,
} from "@/ai/orchestration/truncation-approval-gate";
import { looksLikeTruncatedAgentOutput } from "@/ai/orchestration/looks-like-truncated-agent-output";
import { isUnapprovedDebateExitOutcome } from "@/ai/orchestration/reviewer-decision";
import type { TranscriptEntry } from "@/ai/context/transcript";

describe("truncation enforcement — DebateExitOutcome", () => {
  it("classifies degraded_truncated as unapproved", () => {
    assert.strictEqual(isUnapprovedDebateExitOutcome("degraded_truncated"), true);
  });

  it("classifies approved as NOT unapproved", () => {
    assert.strictEqual(isUnapprovedDebateExitOutcome("approved"), false);
  });
});

describe("getLatestTruncatedCriticalRoles", () => {
  it("returns empty when latest critical turns are complete after earlier truncation", () => {
    const transcript: TranscriptEntry[] = [
      {
        role: "frontend",
        agentName: "Blake",
        content: "Incomplete frontend plan",
        isTruncated: true,
      },
      {
        role: "frontend",
        agentName: "Blake",
        content: "## Frontend Risks\n\nComplete risks. ## Frontend Readiness\n\nReady.",
        isTruncated: false,
      },
      {
        role: "reviewer",
        agentName: "Riley",
        content: "Looks good.\n\n[APPROVE]",
      },
    ];

    assert.deepEqual(getLatestTruncatedCriticalRoles(transcript), []);
    assert.equal(hasCurrentCriticalTruncation(transcript), false);
  });

  it("flags only roles whose latest turn is still truncated", () => {
    const transcript: TranscriptEntry[] = [
      {
        role: "architect",
        agentName: "Sam",
        content: "Architecture cut off at",
        isTruncated: true,
      },
      {
        role: "backend",
        agentName: "Priya",
        content: "Backend plan complete.",
        isTruncated: false,
      },
      {
        role: "architect",
        agentName: "Sam",
        content: "Architecture recovered with complete Decisions & Risks.",
        isTruncated: false,
      },
      {
        role: "frontend",
        agentName: "Blake",
        content: "Still truncated at",
        isTruncated: true,
      },
    ];

    assert.deepEqual(getLatestTruncatedCriticalRoles(transcript), ["frontend"]);
    assert.equal(hasCurrentCriticalTruncation(transcript), true);
  });

  it("ignores non-critical roles even when truncated", () => {
    const transcript: TranscriptEntry[] = [
      {
        role: "pm",
        agentName: "Harper",
        content: "PM brief cut off at",
        isTruncated: true,
      },
      {
        role: "devops",
        agentName: "Quinn",
        content: "DevOps cut off at",
        isTruncated: true,
      },
      {
        role: "backend",
        agentName: "Priya",
        content: "Backend complete.",
      },
    ];

    assert.deepEqual(getLatestTruncatedCriticalRoles(transcript), []);
  });
});

describe("syncHasTruncatedCriticalTurn", () => {
  it("clears sticky history once latest critical turns recover", () => {
    const state = { hasTruncatedCriticalTurn: true };
    const transcript: TranscriptEntry[] = [
      {
        role: "frontend",
        agentName: "Blake",
        content: "Truncated",
        isTruncated: true,
      },
      {
        role: "frontend",
        agentName: "Blake",
        content: "Recovered complete frontend plan.",
        isTruncated: false,
      },
    ];

    syncHasTruncatedCriticalTurn(state, transcript);
    assert.equal(state.hasTruncatedCriticalTurn, false);
  });

  it("keeps the flag when a latest critical turn is still truncated", () => {
    const state = { hasTruncatedCriticalTurn: false };
    const transcript: TranscriptEntry[] = [
      {
        role: "backend",
        agentName: "Priya",
        content: "Backend cut off at",
        isTruncated: true,
      },
    ];

    syncHasTruncatedCriticalTurn(state, transcript);
    assert.equal(state.hasTruncatedCriticalTurn, true);
  });
});

describe("looksLikeTruncatedAgentOutput — frontend heading alone", () => {
  it("does not treat complete structured frontend prose as truncated solely for missing Frontend Risks", () => {
    const text = [
      "## UI & Routing",
      "",
      "App map with three route groups and nested layouts for dashboard views.",
      "",
      "## Key Flows",
      "",
      "Flow one covers magic-link onboarding from email click to checklist render.",
      "",
      "## State Management",
      "",
      "SWR with thirty-second stale time and coalesced auth refresh on concurrent 401 responses.",
    ].join("\n");

    assert.equal(looksLikeTruncatedAgentOutput(text, "frontend"), false);
  });

  it("still flags incomplete frontend structure when Frontend Risks is missing", () => {
    const truncatedComponent = [
      "## Component Architecture",
      "",
      "**Component 4: WelcomeForm** — Client Component",
      "",
      "- Props: hireId and availableRoles",
      "- Internal",
    ].join("\n");

    assert.equal(looksLikeTruncatedAgentOutput(truncatedComponent, "frontend"), true);
  });
});
