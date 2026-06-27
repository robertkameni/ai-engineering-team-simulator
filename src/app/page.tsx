import { SiteFooter } from "@/components/site-footer";
import { LandingFloatingAgents } from "@/features/landing/landing-floating-agents";
import { LandingHero } from "@/features/landing/landing-hero";

export default function HomePage() {
  return (
    <div className="flex min-h-svh flex-col">
      <div className="@container/landing landing-ambient relative flex flex-1 flex-col items-center justify-center overflow-hidden ambient-mesh px-4">
        <LandingFloatingAgents />
        <LandingHero />
      </div>
      <SiteFooter />
    </div>
  );
}
