import "server-only";

import { tool, type ToolSet } from "ai";
import { z } from "zod";

import type { SimulationAgentRole } from "@/ai/agents/config";

const NPM_REGISTRY_TIMEOUT_MS = 8_000;

const NORM_ENTRIES: {
  match: RegExp;
  requiredAction: string;
  source: string;
}[] = [
  {
    match: /dtu\s*60\.?1/i,
    requiredAction:
      "Always ensure 1.5% minimum slope for suspended EU networks; verify pipe diameters, materials, and pressure tests before handover.",
    source: "Mocked DTU Database",
  },
  {
    match: /rgpd|gdpr/i,
    requiredAction:
      "Document lawful basis, minimize personal data collected on site, and maintain a processing register with breach notification within 72 hours.",
    source: "Mocked RGPD Database",
  },
  {
    match: /incendie|fire|erp/i,
    requiredAction:
      "Confirm ERP classification, maintain clear escape routes, provide appropriate extinguishers, and schedule commission de sécurité inspection before opening.",
    source: "Mocked Fire Safety Database",
  },
  {
    match: /dtu/i,
    requiredAction:
      "Cite the applicable DTU for each trade, follow prescribed installation methods, and retain conformity certificates for reception.",
    source: "Mocked DTU Database",
  },
];

export type TechnicalNormLookupResult =
  | {
      status: "success";
      normReference: string;
      requiredAction: string;
      source: string;
    }
  | {
      status: "not_found";
      message: string;
    };

function lookupTechnicalNorm(query: string): TechnicalNormLookupResult {
  const normReference = query.trim();
  if (!normReference) {
    return {
      status: "not_found",
      message: "No specific norm found. Apply general best practices.",
    };
  }

  for (const entry of NORM_ENTRIES) {
    if (entry.match.test(normReference)) {
      return {
        status: "success",
        normReference,
        requiredAction: entry.requiredAction,
        source: entry.source,
      };
    }
  }

  return {
    status: "not_found",
    message: "No specific norm found. Apply general best practices.",
  };
}

const checkNpmPackageTool = tool({
  description:
    "Look up an npm package on the public registry. Returns the latest version and description.",
  inputSchema: z.object({
    packageName: z
      .string()
      .min(1)
      .describe("npm package name, e.g. next, prisma, react"),
  }),
  execute: async ({ packageName }) => {
    const name = packageName.trim();
    if (!name) {
      return { found: false as const, packageName: name };
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const controller = new AbortController();
      timeout = setTimeout(
        () => controller.abort(),
        NPM_REGISTRY_TIMEOUT_MS,
      );

      const response = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`,
        {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        },
      );

      if (response.status === 404) {
        return { found: false as const, packageName: name };
      }

      if (!response.ok) {
        return {
          error: `npm registry returned ${response.status}`,
          packageName: name,
        };
      }

      const data = (await response.json()) as {
        name?: string;
        version?: string;
        description?: string;
      };

      return {
        found: true as const,
        name: data.name ?? name,
        version: data.version ?? "unknown",
        description: data.description ?? "",
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return {
          error: "npm registry lookup timed out",
          packageName: name,
        };
      }
      const message =
        error instanceof Error ? error.message : "fetch failed";
      return { error: message, packageName: name };
    } finally {
      if (timeout != null) {
        clearTimeout(timeout);
      }
    }
  },
});

const searchTechnicalNormTool = tool({
  description:
    "Search regulatory and technical norms (DTU, ERP, fire safety, RGPD, etc.). Returns status, normReference, requiredAction, and source on success.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe('Norm reference or topic, e.g. "DTU 60.1", "RGPD", "incendie ERP"'),
  }),
  execute: async ({ query }) => {
    return lookupTechnicalNorm(query);
  },
});

/** @deprecated Use getAgentTools(role) for per-role tool access. */
const agentTools = {
  check_npm_package: checkNpmPackageTool,
  search_technical_norm: searchTechnicalNormTool,
};

export function getAgentTools(role: SimulationAgentRole): ToolSet {
  switch (role) {
    case "architect":
    case "devops":
      return { check_npm_package: checkNpmPackageTool };
    default:
      return {};
  }
}

export function getComplianceTools(): ToolSet {
  return { search_technical_norm: searchTechnicalNormTool };
}
