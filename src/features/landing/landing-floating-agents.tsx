import { getPersona } from "@/features/agents/personas";
import type { AgentRole } from "@/features/agents/types";
import { cn } from "@/lib/utils";

const FLOATING_AGENTS: {
  role: AgentRole;
  className: string;
  delayClass: string;
}[] = [
  {
    role: "pm",
    className: "top-[14%] left-[6%] max-[520px]:hidden",
    delayClass: "landing-float-a",
  },
  {
    role: "architect",
    className: "top-[18%] right-[5%]",
    delayClass: "landing-float-b",
  },
  {
    role: "backend",
    className: "bottom-[22%] left-[4%] max-[640px]:hidden",
    delayClass: "landing-float-c",
  },
  {
    role: "frontend",
    className: "bottom-[28%] right-[7%] max-[520px]:hidden",
    delayClass: "landing-float-d",
  },
  {
    role: "reviewer",
    className: "top-[42%] left-[10%] max-[720px]:hidden",
    delayClass: "landing-float-e",
  },
];

export function LandingFloatingAgents() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-1 overflow-hidden"
      aria-hidden
    >
      {FLOATING_AGENTS.map(({ role, className, delayClass }) => {
        const persona = getPersona(role);
        return (
          <div
            key={role}
            className={cn(
              "landing-agent-ghost absolute flex size-11 items-center justify-center rounded-full border border-glass-border text-[11px] font-semibold backdrop-blur-sm",
              persona.accentClass,
              persona.badgeClass,
              className,
              delayClass,
            )}
          >
            {persona.initials}
          </div>
        );
      })}
    </div>
  );
}
