import type { MockArtifacts, MockRun } from "@/features/agents/types";

export const EXAMPLE_PROMPTS = [
  "Build a food delivery app for students",
  "Build an AI travel planner for Europe",
  "Create a study group matching platform",
] as const;

export const MOCK_RECENT_RUNS: Pick<
  MockRun,
  "id" | "title" | "status" | "updatedAt"
>[] = [
  {
    id: "run-1",
    title: "Food delivery for students",
    status: "complete",
    updatedAt: "2h ago",
  },
  {
    id: "run-2",
    title: "AI travel planner for Europe",
    status: "complete",
    updatedAt: "Yesterday",
  },
  {
    id: "run-3",
    title: "Study group matcher",
    status: "running",
    updatedAt: "Just now",
  },
];

export const MOCK_ACTIVE_RUN: MockRun = {
  id: "run-demo",
  title: "Food delivery for students",
  userPrompt: "Build a food delivery app for students on campus",
  status: "complete",
  updatedAt: "Just now",
  messages: [
    {
      id: "msg-1",
      role: "pm",
      createdAt: "10:02",
      content: `## Scope

I'll keep v1 focused on **campus-only delivery** where trust and speed matter more than nationwide coverage.

### Core features
- Student signup with **.edu email** verification
- Browse restaurants inside a **geo-fenced campus**
- Group orders ("roommate cart") with split payment later
- Order tracking with ETA ranges, not false precision

### User stories
1. As a student, I want to see only restaurants that deliver to my dorm so I don't order unavailable food.
2. As a student, I want to share a cart with roommates so we can hit minimum order amounts.
3. As a restaurant partner, I want a tablet-friendly order queue during lunch rush.

### Out of scope (v1)
- Nationwide shipping, loyalty points, subscription passes`,
    },
    {
      id: "msg-2",
      role: "architect",
      createdAt: "10:04",
      content: `Responding to Morgan's scope — a **modular monolith** is the right call for v1. Microservices would be premature for lunch-rush traffic on one campus.

### System design
- **Next.js** web app + Route Handlers for API
- **PostgreSQL** for orders, users, restaurants
- **Redis** later for session cart + rate limiting (not day one)

### Data model (high level)
- \`users\`, \`campuses\`, \`restaurants\`, \`menus\`, \`orders\`, \`order_items\`, \`group_carts\`

### Scaling strategy
- Start single-region; partition by \`campus_id\` when you expand
- Read-heavy menu data → cache with short TTL during peak hours

### Tradeoff
Morgan's group-cart feature needs **real-time cart sync**. I'd use optimistic UI first, then WebSockets only if conflict rates hurt UX.`,
    },
    {
      id: "msg-3",
      role: "reviewer",
      createdAt: "10:06",
      quote: {
        agentName: "Alex",
        text: "Modular monolith is the right call for v1. Microservices would be premature.",
      },
      content: `### Review

I **agree** with Alex on avoiding microservices, but I want to push back on two points.

**1. Group cart without sync protocol**  
Alex proposes "optimistic UI first" — that's fine for MVP demos, but split payments will create **cart drift** when three roommates edit simultaneously. Minimum fix: version column on \`group_carts\` + conflict toast.

**2. .edu verification**  
PM's verification is good for trust, but international students and community colleges break naive \`.edu\` checks. Plan a manual fallback queue before launch.

**3. Lunch rush**  
Architect mentions caching menus — also cap concurrent checkouts per restaurant or you'll overload kitchen tablets.

### Verdict
Ship the monolith. Add cart versioning before marketing group orders.`,
    },
  ],
};

export const MOCK_ARTIFACTS: MockArtifacts = {
  requirements: [
    {
      title: "Core features",
      items: [
        ".edu email verification (+ manual fallback)",
        "Campus geo-fenced restaurant catalog",
        "Group cart with split payment (v1.1)",
        "Order tracking with ETA ranges",
      ],
    },
    {
      title: "Out of scope",
      items: ["Nationwide delivery", "Loyalty program", "Subscriptions"],
    },
  ],
  architecture: [
    {
      title: "Stack",
      items: [
        "Next.js (web + API)",
        "PostgreSQL",
        "Redis (phase 2)",
      ],
    },
    {
      title: "Risks",
      items: [
        "Lunch rush read load on menus",
        "Group cart conflicts without versioning",
      ],
    },
  ],
  review: [
    {
      title: "Concerns",
      items: [
        "Cart drift on concurrent edits",
        ".edu verification edge cases",
        "Kitchen tablet overload at peak",
      ],
    },
    {
      title: "Recommendations",
      items: [
        "Ship modular monolith",
        "Add cart version column before group-order launch",
        "Per-restaurant checkout throttling",
      ],
    },
  ],
};
