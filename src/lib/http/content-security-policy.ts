/**
 * Per-request CSP builder for nonce-based script-src (arch-review F3 follow-up).
 * Production omits 'unsafe-inline' / 'unsafe-eval' on script-src.
 * Development keeps 'unsafe-eval' for React debug tooling (Next.js CSP guide).
 */

export type BuildContentSecurityPolicyInput = {
  readonly nonce: string;
  readonly isDevelopment: boolean;
};

export function createCspNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

export function buildContentSecurityPolicy(
  input: BuildContentSecurityPolicyInput,
): string {
  const { nonce, isDevelopment } = input;

  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDevelopment ? (["'unsafe-eval'"] as const) : []),
  ];

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    // Styles stay permissive: Tailwind/Radix rely on inline style attributes.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(!isDevelopment ? (["upgrade-insecure-requests"] as const) : []),
  ];

  return directives.join("; ");
}

export function hasUnsafeScriptTokens(cspHeader: string): boolean {
  const scriptSrc = cspHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("script-src "));

  if (!scriptSrc) {
    return false;
  }

  return (
    scriptSrc.includes("'unsafe-inline'") ||
    scriptSrc.includes("'unsafe-eval'")
  );
}
