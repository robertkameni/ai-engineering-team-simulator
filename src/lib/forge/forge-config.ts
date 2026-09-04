import "server-only";

export type ForgePartnerConfig = {
  readonly baseUrl: string;
  readonly partnerSecret: string;
};

function trimEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

/** Returns null when either var is missing (caller maps to 503). */
export function getForgePartnerConfig(): ForgePartnerConfig | null {
  const baseUrl = trimEnv("FORGE_BASE_URL")?.replace(/\/$/, "") ?? null;
  const partnerSecret = trimEnv("FORGE_PARTNER_SECRET");
  if (!baseUrl || !partnerSecret) {
    return null;
  }
  return { baseUrl, partnerSecret };
}
