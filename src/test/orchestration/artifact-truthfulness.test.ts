// Phase 2B — Artifact truthfulness validation tests
//
// ARTIFACT TRUTHFULNESS GUARD
// STATE CONSISTENCY POST-CHECK

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  validateArtifactTruthfulness,
  checkMissingProvisionalMarkers,
  checkMissingOpenGapAcknowledgement,
  checkOverstatedFinality,
  type ArtifactTruthfulnessContext,
} from "@/ai/artifacts/validate-artifact-truthfulness";
import type { ArtifactDocument } from "@/features/artifacts/schemas";

const unapprovedContext: ArtifactTruthfulnessContext = {
  isUnapproved: true,
  hasOpenGaps: false,
  isTruncationDegraded: false,
};

const approvedContext: ArtifactTruthfulnessContext = {
  isUnapproved: false,
  hasOpenGaps: false,
  isTruncationDegraded: false,
};

const unapprovedWithGaps: ArtifactTruthfulnessContext = {
  isUnapproved: true,
  hasOpenGaps: true,
  isTruncationDegraded: false,
};

function buildDocument(sections: { title: string; items: string[] }[]): ArtifactDocument {
  return { sections };
}

describe("checkMissingProvisionalMarkers", () => {
  it("flags document with no provisional markers for unapproved run", () => {
    const doc = buildDocument([
      {
        title: "Scope",
        items: [
          "The application will support user authentication via OAuth 2.0.",
          "The backend will use PostgreSQL for persistent storage.",
          "The final architecture is settled and confirmed by the team.",
        ],
      },
    ]);

    const violations = checkMissingProvisionalMarkers(doc);
    assert.ok(violations.length > 0);
    assert.ok(violations.some((v) =>
      v.message.includes("lacks a provisional") || v.message.includes("lacks any provisional"),
    ));
  });

  it("accepts document with provisional marker for unapproved run", () => {
    const doc = buildDocument([
      {
        title: "Scope (draft — provisional)",
        items: [
          "The application may support user authentication via OAuth 2.0 (tentative).",
          "The backend will use PostgreSQL for persistent storage (preliminary).",
        ],
      },
    ]);

    const violations = checkMissingProvisionalMarkers(doc);
    assert.deepStrictEqual(violations, []);
  });

  it("accepts document with 'draft' marker", () => {
    const doc = buildDocument([
      {
        title: "Architecture (draft)",
        items: [
          "This is a draft architecture for the product.",
          "The stack is subject to change pending full review.",
        ],
      },
    ]);

    const violations = checkMissingProvisionalMarkers(doc);
    assert.deepStrictEqual(violations, []);
  });

  it("accepts document with 'not finalized' marker", () => {
    const doc = buildDocument([
      {
        title: "Implementation Plan",
        items: [
          "These decisions are not finalized — the debate ended without full approval.",
          "CI/CD pipeline recommendations are provisional.",
        ],
      },
    ]);

    const violations = checkMissingProvisionalMarkers(doc);
    assert.deepStrictEqual(violations, []);
  });

  // Test G: Approved run should stay clean
  it("does not falsely flag approved documents — happy path stays clean", () => {
    const doc = buildDocument([
      {
        title: "Scope",
        items: [
          "The application will support user authentication via OAuth 2.0.",
          "The backend will use PostgreSQL for persistent storage.",
          "The final architecture is settled and confirmed by the team.",
        ],
      },
    ]);

    const result = validateArtifactTruthfulness(doc, approvedContext);
    assert.strictEqual(result.isTruthful, true);
    assert.deepStrictEqual(result.violations, []);
  });
});

describe("checkMissingOpenGapAcknowledgement", () => {
  it("flags document that does not acknowledge open gaps", () => {
    const doc = buildDocument([
      {
        title: "Architecture",
        items: [
          "We decided on microservices architecture.",
          "All risks have been resolved.",
          "All recommendations are fully implemented.",
        ],
      },
    ]);

    const violations = checkMissingOpenGapAcknowledgement(doc, true);
    assert.ok(violations.length > 0);
    assert.ok(violations[0]!.message.includes("does not acknowledge"));
  });

  it("accepts document that acknowledges gaps with 'recommended'", () => {
    const doc = buildDocument([
      {
        title: "Architecture",
        items: [
          "We decided on a microservices architecture.",
          "Rate limiting is recommended but not yet implemented.",
          "The reviewer flagged the auth model as unresolved.",
        ],
      },
    ]);

    const violations = checkMissingOpenGapAcknowledgement(doc, true);
    assert.deepStrictEqual(violations, []);
  });

  it("accepts document that uses 'open gap' terminology", () => {
    const doc = buildDocument([
      {
        title: "Review",
        items: [
          "Open gap: caching strategy was not finalized.",
          "Open gap: observability tooling is proposed but not yet selected.",
        ],
      },
    ]);

    const violations = checkMissingOpenGapAcknowledgement(doc, true);
    assert.deepStrictEqual(violations, []);
  });

  it("skips check when hasOpenGaps is false", () => {
    const doc = buildDocument([
      {
        title: "Architecture",
        items: [
          "Everything is done.",
        ],
      },
    ]);

    const violations = checkMissingOpenGapAcknowledgement(doc, false);
    assert.deepStrictEqual(violations, []);
  });
});

describe("checkOverstatedFinality", () => {
  it("flags artifact with many finality words and no provisional counterbalance", () => {
    const doc = buildDocument([
      {
        title: "Implementation",
        items: [
          "The architecture is finalized and approved.",
          "All decisions are confirmed and the design is completed.",
          "The resolved issues include the settled API contract.",
          "This definitive blueprint is shipped and delivered.",
        ],
      },
    ]);

    const violations = checkOverstatedFinality(doc);
    assert.ok(violations.length > 0);
  });

  it("accepts artifact with finality words balanced by provisional markers", () => {
    const doc = buildDocument([
      {
        title: "Implementation (provisional)",
        items: [
          "The architecture is proposed (subject to change).",
          "While the API contract is proposed, the implementation detail is tentative.",
          "This is a draft — nothing is finalized yet.",
        ],
      },
    ]);

    const violations = checkOverstatedFinality(doc);
    assert.deepStrictEqual(violations, []);
  });

  it("accepts artifact with low finality count below threshold", () => {
    const doc = buildDocument([
      {
        title: "Implementation",
        items: [
          "The team reached consensus on the API design.",
          "PostgreSQL will be the primary database.",
          "The CI/CD pipeline is planned with GitHub Actions.",
        ],
      },
    ]);

    // Only 1-2 finality hits ("consensus") → below threshold
    const violations = checkOverstatedFinality(doc);
    assert.deepStrictEqual(violations, []);
  });

  // Test D: Overly final wording in unapproved run
  it("flags unapproved artifact with overly final wording", () => {
    const doc = buildDocument([
      {
        title: "Final Architecture",
        items: [
          "The solution is resolved and finalized.",
          "All components are approved, completed, and shipped.",
          "The definitive design is settled and confirmed.",
          "This is the conclusive, delivered architecture.",
        ],
      },
    ]);

    const result = validateArtifactTruthfulness(doc, unapprovedContext);
    assert.strictEqual(result.isTruthful, false);
    assert.ok(result.violations.some((v) =>
      v.message.includes("overly final language") || v.message.includes("lacks a provisional"),
    ));
  });

  // Test G: Approved run stays clean
  it("approved run with normal language passes all checks", () => {
    const doc = buildDocument([
      {
        title: "Architecture",
        items: [
          "Microservices with API Gateway pattern.",
          "PostgreSQL for primary database.",
          "Redis for caching layer.",
        ],
      },
    ]);

    const result = validateArtifactTruthfulness(doc, approvedContext);
    assert.strictEqual(result.isTruthful, true);
    assert.deepStrictEqual(result.violations, []);
  });
});

describe("validateArtifactTruthfulness — composite", () => {
  // Test C: Missing provisional marker is flagged
  it("flags unapproved artifact without provisional marker", () => {
    const doc = buildDocument([
      {
        title: "Scope",
        items: [
          "The application supports authentication.",
          "Backend uses PostgreSQL.",
          "Final architecture is confirmed.",
        ],
      },
    ]);

    const result = validateArtifactTruthfulness(doc, unapprovedContext);
    assert.strictEqual(result.isTruthful, false);
    assert.ok(result.violations.some((v) =>
      v.message.includes("lacks a provisional") || v.message.includes("lacks any provisional"),
    ));
  });

  // Test E: Open gaps must surface
  it("flags artifact that ignores open gaps in an unapproved run", () => {
    const doc = buildDocument([
      {
        title: "Architecture",
        items: [
          "The team decided on monolith.",
          "All risks have been fully resolved.",
          "No outstanding concerns remain.",
        ],
      },
    ]);

    const result = validateArtifactTruthfulness(doc, unapprovedWithGaps);
    assert.strictEqual(result.isTruthful, false);
  });

  it("accepts artifact that properly reflects provisional + open-gap state", () => {
    const doc = buildDocument([
      {
        title: "Architecture (draft — unapproved)",
        items: [
          "The provisional architecture uses a monolith with potential future split.",
          "Reviewer flagged: authentication model is unresolved — recommendation pending.",
          "Caching strategy is proposed via Redis but not yet implemented.",
        ],
      },
    ]);

    const result = validateArtifactTruthfulness(doc, unapprovedWithGaps);
    assert.strictEqual(result.isTruthful, true);
    assert.deepStrictEqual(result.violations, []);
  });

  it("passes when neither unapproved nor open gaps", () => {
    const doc = buildDocument([
      {
        title: "Architecture",
        items: [
          "Final architecture: microservices.",
          "All decisions are confirmed.",
        ],
      },
    ]);

    const result = validateArtifactTruthfulness(doc, approvedContext);
    assert.strictEqual(result.isTruthful, true);
  });
});
