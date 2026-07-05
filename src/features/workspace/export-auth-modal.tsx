"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { ExportFormat } from "@/features/workspace/export-format";

type AuthMode = "register" | "login";

interface ExportAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthSuccess: () => Promise<void>;
  exportFormat?: ExportFormat;
}

async function postAuth(
  mode: AuthMode,
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(`/api/auth/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  let errorMessage: string | undefined;
  try {
    const data: unknown = await response.json();
    if (typeof data === "object" && data !== null && "error" in data) {
      errorMessage =
        typeof (data as Record<string, unknown>).error === "string"
          ? ((data as Record<string, unknown>).error as string)
          : undefined;
    }
  } catch {
    return {
      ok: false,
      error:
        response.status >= 500
          ? "Server error during sign-in. If this persists, contact support."
          : "Authentication failed",
    };
  }

  if (!response.ok) {
    return { ok: false, error: errorMessage ?? "Authentication failed" };
  }

  return { ok: true };
}

export function ExportAuthModal({
  open,
  onOpenChange,
  onAuthSuccess,
  exportFormat = "markdown",
}: ExportAuthModalProps) {
  const formatLabel = exportFormat === "pdf" ? "PDF" : "Markdown";
  const [mode, setMode] = useState<AuthMode>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(submitEvent: React.SubmitEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await postAuth(mode, email.trim(), password);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      await onAuthSuccess();
      onOpenChange(false);
      setPassword("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export your deliverables</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-left text-caption">
              <p>
                Create a free account to download this simulation as {formatLabel}{" "}
                — debate, artifacts, and usage included.
              </p>
              <ul className="list-disc space-y-1 pl-4">
                <li>Running simulations stays free without an account.</li>
                <li>Reading results in the app stays free.</li>
                <li>
                  Recent runs on this browser will attach to your new account
                  automatically.
                </li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="export-auth-email" className="text-caption font-medium">
              Email
            </label>
            <input
              id="export-auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="glass-card w-full rounded-lg border border-glass-border bg-transparent px-3 py-2 text-body outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="export-auth-password"
              className="text-caption font-medium"
            >
              Password
            </label>
            <input
              id="export-auth-password"
              type="password"
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="glass-card w-full rounded-lg border border-glass-border bg-transparent px-3 py-2 text-body outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {error ? (
            <p className="text-caption text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting
              ? "Please wait…"
              : mode === "register"
                ? "Create free account & export"
                : "Sign in & export"}
          </Button>
        </form>

        <p className="text-center text-caption text-muted-foreground">
          {mode === "register" ? "Already have an account?" : "New here?"}{" "}
          <button
            type="button"
            className="font-medium text-foreground underline-offset-4 hover:underline"
            onClick={() => {
              setMode(mode === "register" ? "login" : "register");
              setError(null);
            }}
          >
            {mode === "register" ? "Sign in" : "Create account"}
          </button>
        </p>
      </DialogContent>
    </Dialog>
  );
}