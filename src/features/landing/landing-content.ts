import type { AgentRole } from "@/lib/types";

export const LANDING_DEBATE_SNIPPETS: {
  role: AgentRole;
  text: string;
}[] = [
  {
    role: "pm",
    text: "Let's keep v1 focused — geo-fenced campus delivery only.",
  },
  {
    role: "architect",
    text: "Modular monolith fits lunch-rush traffic without ops overhead.",
  },
  {
    role: "backend",
    text: "PostgreSQL for orders; Redis later for menu cache at peak.",
  },
  {
    role: "frontend",
    text: "Optimistic cart UI first — WebSockets only if conflicts hurt UX.",
  },
  {
    role: "reviewer",
    text: "Ship the monolith, but add cart versioning before group orders.",
  },
];

export const LANDING_PLACEHOLDER_IDEAS = [
  "A food donation app for a church community…",
  "An IFC/BIM tool to verify DTU 60.1 conformity…",
  "A subscription analytics dashboard for indie SaaS…",
  "A campus bike-sharing program with fleet tracking…",
  "A field inspection app for construction sites…",
] as const;
