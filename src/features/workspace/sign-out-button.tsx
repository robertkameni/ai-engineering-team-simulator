"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { workspaceHeaderAccountButtonClass } from "@/features/workspace/workspace-header-button-styles";

interface SignOutButtonProps {
  email?: string | null;
}

export function SignOutButton({ email }: SignOutButtonProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.refresh();
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
