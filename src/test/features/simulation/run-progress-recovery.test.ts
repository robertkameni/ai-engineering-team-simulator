import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import {
  isRunProgressTerminal,
  recoverRunAfterStreamDrop,
  type RunProgressSnapshot,
} from "@/features/simulation/simulation-stream-polling";

describe("isRunProgressTerminal", () => {
  it("treats complete and failed as terminal", () => {
    assert.equal(isRunProgressTerminal("complete"), true);
    assert.equal(isRunProgressTerminal("failed"), true);
    assert.equal(isRunProgressTerminal("running"), false);
    assert.equal(isRunProgressTerminal("idle"), false);
  });
});

describe("recoverRunAfterStreamDrop", () => {
  it("polls the slim progress endpoint and issues one full fetch when complete", async () => {
    const fetchMock = mock.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/progress")) {
        return new Response(
          JSON.stringify({
            status: "complete",
            messageCount: 6,
            lastMessageText: "Approved",
            artifactsComplete: true,
          } satisfies RunProgressSnapshot),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/api/runs/run_1") && !url.includes("/artifacts")) {
        return new Response(
          JSON.stringify({
            id: "run_1",
            status: "complete",
            messages: [
              {
                id: "m1",
                role: "pm",
                content: "Done",
                createdAt: "12:00",
              },
            ],
            artifacts: null,
            artifactsStatus: "ready",
            debateOutcome: "approved",
            teamRoster: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const previousFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const setters = {
      setArtifacts: mock.fn(),
      setArtifactsStatus: mock.fn(),
      setDebateOutcome: mock.fn(),
      setStackValidationFailed: mock.fn(),
      setCrossValidationFailed: mock.fn(),
      setStatus: mock.fn(),
      setError: mock.fn(),
      setActiveAgent: mock.fn(),
      setRunId: mock.fn(),
      setMessages: mock.fn(),
      setTeamRoster: mock.fn(),
    };
    const onComplete = mock.fn();

    try {
      await recoverRunAfterStreamDrop("run_1", setters, onComplete);

      const urls = fetchMock.mock.calls.map((call) => String(call.arguments[0]));
      assert.equal(urls.filter((url) => url.endsWith("/progress")).length, 1);
      assert.equal(
        urls.filter(
          (url) => url.includes("/api/runs/run_1") && !url.endsWith("/progress"),
        ).length,
        1,
      );
      assert.equal(setters.setMessages.mock.callCount(), 1);
      assert.equal(onComplete.mock.callCount(), 1);
      assert.deepEqual(onComplete.mock.calls[0]?.arguments, ["run_1"]);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
