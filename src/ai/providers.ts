import { createDeepSeek } from "@ai-sdk/deepseek";

/**
 * DeepSeek v4 model IDs.
 * @see https://api-docs.deepseek.com — `deepseek-chat` / `deepseek-reasoner` are deprecated (2026-07-24).
 */
export type DeepSeekModelId = "deepseek-v4-flash" | "deepseek-v4-pro";

export function getDeepSeekModel(modelId: DeepSeekModelId = "deepseek-v4-flash") {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }

  const deepseek = createDeepSeek({ apiKey });
  return deepseek(modelId);
}
