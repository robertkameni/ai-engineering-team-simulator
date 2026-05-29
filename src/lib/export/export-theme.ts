import type { AgentRole } from "@/features/agents/types";

/** Resolved hex tokens from `globals.css` (no oklch / CSS variables). */
export const exportTheme = {
  background: "#121218",
  foreground: "#f5f5f7",
  card: "#1c1c24",
  cardForeground: "#f5f5f7",
  muted: "#2a2a34",
  mutedForeground: "#a1a1b0",
  border: "#2e2e3a",
  glassBorder: "#ffffff1f",
  primary: "#f5f5f7",
  destructive: "#e85d4a",
  agent: {
    pm: "#e8b86d",
    architect: "#6b8fd4",
    frontend: "#c77fd4",
    backend: "#6bc98a",
    reviewer: "#d47a6b",
    devops: "#6bb8c9",
  } satisfies Record<AgentRole, string>,
} as const;

export function agentAccentHex(role: AgentRole): string {
  return exportTheme.agent[role];
}

/** Print/PDF stylesheet: light paper, agent accents, readable blockquotes. */
export const EXPORT_PRINT_CSS = `
  @page {
    size: A4;
    margin: 20mm;
  }

  html,
  body {
    background: #ffffff !important;
    color: #1a1a22 !important;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 10.5pt;
    line-height: 1.55;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  h1 {
    font-size: 20pt;
    font-weight: 700;
    color: #121218;
    margin: 0 0 0.75rem;
    border-bottom: 2px solid ${exportTheme.border};
    padding-bottom: 0.5rem;
  }

  h2 {
    font-size: 14pt;
    font-weight: 600;
    color: #121218;
    margin: 1.5rem 0 0.75rem;
  }

  h3,
  .message-heading {
    font-size: 11.5pt;
    font-weight: 600;
    margin: 0 0 0.5rem;
  }

  h4 {
    font-size: 10.5pt;
    font-weight: 600;
    margin: 1rem 0 0.35rem;
    color: #3a3a48;
  }

  p {
    margin: 0.35rem 0;
  }

  ul {
    margin: 0.35rem 0 0.75rem;
    padding-left: 1.25rem;
  }

  li {
    margin: 0.2rem 0;
  }

  hr {
    border: none;
    border-top: 1px solid ${exportTheme.border};
    margin: 1.25rem 0;
  }

  code {
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
    font-size: 9pt;
    background: #f0f0f4;
    padding: 0.1em 0.35em;
    border-radius: 3px;
  }

  strong {
    font-weight: 600;
    color: #121218;
  }

  .meta-block {
    color: #5c5c6e;
    font-size: 9.5pt;
    margin-bottom: 1rem;
  }

  .message {
    border: 1px solid ${exportTheme.border};
    border-radius: 8px;
    padding: 0.85rem 1rem;
    margin: 0 0 1rem;
    background: #fafafc;
    page-break-inside: avoid;
  }

  .message--pm { border-left: 4px solid ${exportTheme.agent.pm}; }
  .message--architect { border-left: 4px solid ${exportTheme.agent.architect}; }
  .message--frontend { border-left: 4px solid ${exportTheme.agent.frontend}; }
  .message--backend { border-left: 4px solid ${exportTheme.agent.backend}; }
  .message--reviewer { border-left: 4px solid ${exportTheme.agent.reviewer}; }
  .message--devops { border-left: 4px solid ${exportTheme.agent.devops}; }

  .message--pm .message-heading { color: ${exportTheme.agent.pm}; }
  .message--architect .message-heading { color: ${exportTheme.agent.architect}; }
  .message--frontend .message-heading { color: ${exportTheme.agent.frontend}; }
  .message--backend .message-heading { color: ${exportTheme.agent.backend}; }
  .message--reviewer .message-heading { color: ${exportTheme.agent.reviewer}; }
  .message--devops .message-heading { color: ${exportTheme.agent.devops}; }

  .artifact-panel {
    border: 1px solid ${exportTheme.border};
    border-radius: 8px;
    padding: 0.85rem 1rem;
    margin: 0 0 1rem;
    page-break-inside: avoid;
  }

  .artifact-panel--requirements { border-top: 3px solid ${exportTheme.agent.pm}; }
  .artifact-panel--architecture { border-top: 3px solid ${exportTheme.agent.architect}; }
  .artifact-panel--implementation { border-top: 3px solid ${exportTheme.agent.backend}; }
  .artifact-panel--review { border-top: 3px solid ${exportTheme.agent.reviewer}; }

  .export-quote {
    border-left: 3px solid ${exportTheme.mutedForeground};
    background: #f4f4f8;
    padding: 0.5rem 0.75rem;
    margin: 0.5rem 0;
    font-size: 9.5pt;
    color: #3a3a48;
  }

  .export-quote cite {
    display: block;
    font-style: normal;
    font-weight: 600;
    margin-bottom: 0.25rem;
    color: #5c5c6e;
  }

  .export-warning {
    background: #fff8e6;
    border: 1px solid #e8c96d;
    border-radius: 6px;
    padding: 0.65rem 0.85rem;
    margin: 0.75rem 0;
    font-size: 9.5pt;
  }
`;
