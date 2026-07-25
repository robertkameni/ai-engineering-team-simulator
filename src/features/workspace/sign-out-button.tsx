"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { workspaceHeaderAccountButtonClass } from "@/components/ui/button-styles";

const NON_RELEASABLE_RUN_IDS = new Set(["live", "new"]);

function isReleasableRunId(runId: string | null | undefined): runId is string {
  return (
    typeof runId === "string" &&
    runId.length > 0 &&
    !NON_RELEASABLE_RUN_IDS.has(runId)
  );
}

interface SignOutButtonProps {
  email?: string | null;
  releaseRunId?: string | null;
}

export function SignOutButton({ email, releaseRunId }: SignOutButtonProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      const body = isReleasableRunId(releaseRunId) ? { runId: releaseRunId } : {};
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        console.warn("Sign-out request failed with status", response.status);
      }
      router.refresh();
    } catch (error) {
      console.warn("Sign-out network error:", error);
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isSigningOut}
      onClick={() => void handleSignOut()}
      className={workspaceHeaderAccountButtonClass}
      title={email ? `Signed in as ${email}` : "Sign out"}
    >
      <LogOut className="size-3.5" />
      <span className="hidden max-w-32 truncate @[720px]/workspace-header:inline">
        {email ?? "Account"}
      </span>
    </Button>
  );
}
