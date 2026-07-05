import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRunStyledMarkdown } from "../../lib/export/build-run-export-document.js";
import { exportPdfPostBodySchema } from "../../lib/export/export-pdf-payload.js";
import {
  EXPORT_PDF_MAX_ARTIFACT_ITEM_CHARS,
  EXPORT_PDF_MAX_ARTIFACT_ITEMS,
  EXPORT_PDF_MAX_MESSAGE_CONTENT_CHARS,
  EXPORT_PDF_MAX_MESSAGES,
  PDF_DOCUMENT_TITLE,
} from "../../lib/export/export-pdf-limits.js";

function minimalValidExportBody() {
  return {
    run: {
      id: "run-1",
      title: "Test simulation",
      userPrompt: "Build a task app",
      status: "complete" as const,
      updatedAt: "2026-01-01T00:00:00.000Z",
      messages: [
        {
          id: "msg-1",
          role: "pm" as const,
          content: "Scope overview",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
  };
}

describe("exportPdfPostBodySchema volumetry", () => {
  it("accepts a minimal valid payload", () => {
    const parsed = exportPdfPostBodySchema.safeParse(minimalValidExportBody());
    assert.equal(parsed.success, true);
  });

  it("rejects more than 50 transcript messages", () => {
    const messages = Array.from({ length: EXPORT_PDF_MAX_MESSAGES + 1 }, (_, i) => ({
      id: `msg-${i}`,
      role: "pm" as const,
      content: "line",
      createdAt: "2026-01-01T00:00:00.000Z",
    }));

    const parsed = exportPdfPostBodySchema.safeParse({
      run: {
        ...minimalValidExportBody().run,
        messages,
      },
    });

    assert.equal(parsed.success, false);
  });

  it("rejects message content exceeding 51200 characters", () => {
    const parsed = exportPdfPostBodySchema.safeParse({
      run: {
        ...minimalValidExportBody().run,
        messages: [
          {
            id: "msg-1",
            role: "pm",
            content: "x".repeat(EXPORT_PDF_MAX_MESSAGE_CONTENT_CHARS + 1),
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });

    assert.equal(parsed.success, false);
  });

  it("rejects more than 500 artifact items across panels", () => {
    const items = Array.from({ length: EXPORT_PDF_MAX_ARTIFACT_ITEMS + 1 }, () => "item");

    const parsed = exportPdfPostBodySchema.safeParse({
      run: {
        ...minimalValidExportBody().run,
        artifacts: {
          requirements: [{ title: "Section", items }],
        },
      },
    });

    assert.equal(parsed.success, false);
  });

  it("rejects titles longer than 500 characters", () => {
    const parsed = exportPdfPostBodySchema.safeParse({
      run: {
        ...minimalValidExportBody().run,
        title: "t".repeat(501),
      },
    });

    assert.equal(parsed.success, false);
  });

  it("rejects user prompts longer than 4000 characters", () => {
    const parsed = exportPdfPostBodySchema.safeParse({
      run: {
        ...minimalValidExportBody().run,
        userPrompt: "p".repeat(4001),
      },
    });

    assert.equal(parsed.success, false);
  });

  it("rejects artifact items longer than 2048 characters", () => {
    const parsed = exportPdfPostBodySchema.safeParse({
      run: {
        ...minimalValidExportBody().run,
        artifacts: {
          requirements: [
            {
              title: "Section",
              items: ["x".repeat(EXPORT_PDF_MAX_ARTIFACT_ITEM_CHARS + 1)],
            },
          ],
        },
      },
    });

    assert.equal(parsed.success, false);
  });

  it("accepts artifact items at the maximum length", () => {
    const parsed = exportPdfPostBodySchema.safeParse({
      run: {
        ...minimalValidExportBody().run,
        artifacts: {
          requirements: [
            {
              title: "Section",
              items: ["x".repeat(EXPORT_PDF_MAX_ARTIFACT_ITEM_CHARS)],
            },
          ],
        },
      },
    });

    assert.equal(parsed.success, true);
  });
});

describe("buildRunStyledMarkdown title sanitization", () => {
  it("escapes HTML in the document title", () => {
    const markdown = buildRunStyledMarkdown({
      run: {
        id: "run-1",
        title: '<script>alert("x")</script>',
        userPrompt: "Prompt",
        status: "complete",
        updatedAt: "2026-01-01T00:00:00.000Z",
        messages: [
          {
            id: "msg-1",
            role: "pm",
            content: "Hello",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        artifacts: null,
      },
    });

    assert.match(markdown, /# &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
    assert.doesNotMatch(markdown, /<script>/);
  });

  it("uses unknown role class for poisoned agentRole values", () => {
    const markdown = buildRunStyledMarkdown({
      run: {
        id: "run-1",
        title: "Test",
        userPrompt: "Prompt",
        status: "complete",
        updatedAt: "2026-01-01T00:00:00.000Z",
        messages: [
          {
            id: "msg-1",
            role: 'pm"><script>alert(1)</script><div class="' as "pm",
            content: "Hello",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        artifacts: null,
      },
    });

    assert.match(markdown, /message--unknown/);
    assert.doesNotMatch(markdown, /message--pm"><script>/);
  });
});

describe("PDF_DOCUMENT_TITLE", () => {
  it("is a static system title regardless of user input context", () => {
    assert.equal(PDF_DOCUMENT_TITLE, "Engineering Simulation Report");
    assert.doesNotMatch(PDF_DOCUMENT_TITLE, /script/i);
  });
});
