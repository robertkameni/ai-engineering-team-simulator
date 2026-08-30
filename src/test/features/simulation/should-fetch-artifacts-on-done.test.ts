import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shouldFetchArtifactsOnDone } from "@/features/simulation/should-fetch-artifacts-on-done";

describe("shouldFetchArtifactsOnDone", () => {
  it("skips a second GET when the stream already delivered artifacts", () => {
    assert.equal(
      shouldFetchArtifactsOnDone({
        artifactTimeout: undefined,
        alreadyFetchedViaStream: true,
      }),
      false,
    );
  });

  it("fetches when the stream never settled artifacts", () => {
    assert.equal(
      shouldFetchArtifactsOnDone({
        artifactTimeout: undefined,
        alreadyFetchedViaStream: false,
      }),
      true,
    );
  });

  it("still polls when synthesis timed out", () => {
    assert.equal(
      shouldFetchArtifactsOnDone({
        artifactTimeout: true,
        alreadyFetchedViaStream: true,
      }),
      true,
    );
  });
});
