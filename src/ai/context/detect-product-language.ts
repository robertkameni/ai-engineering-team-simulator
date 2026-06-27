/** Languages the simulator explicitly supports matching. */
export type ProductLanguage = "english" | "french" | "chinese";

const CJK_PATTERN = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
const FRENCH_ACCENT_PATTERN = /[àâäéèêëïîôùûüçœæ]/i;
const FRENCH_KEYWORD_PATTERN =
  /\b(sans|avec|pour|une|des|les|logiciel|conformit[eé]|travaux|chantier|b[aâ]timent|norme|r[eé]glement)\b/i;

function cjkRatio(text: string): number {
  if (text.length === 0) return 0;
  const matches = text.match(new RegExp(CJK_PATTERN.source, "g"));
  return (matches?.length ?? 0) / text.length;
}

/**
 * Heuristic language detection from the product idea text.
 * Latin-script English prompts default to English (avoids DeepSeek Chinese drift).
 */
function detectProductLanguage(text: string): ProductLanguage {
  const trimmed = text.trim();
  if (!trimmed) return "english";

  if (cjkRatio(trimmed) >= 0.08) {
    return "chinese";
  }

  if (FRENCH_ACCENT_PATTERN.test(trimmed) || FRENCH_KEYWORD_PATTERN.test(trimmed)) {
    return "french";
  }

  return "english";
}

function productLanguageLabel(language: ProductLanguage): string {
  switch (language) {
    case "english":
      return "English";
    case "french":
      return "French";
    case "chinese":
      return "Chinese";
  }
}

export function buildLanguageMatchDirective(productIdea: string): string {
  const language = detectProductLanguage(productIdea);
  const label = productLanguageLabel(language);
  const base = `CRITICAL: The product idea is written in ${label}. You MUST write your entire response in ${label}, including all section headings. Do not switch languages unless quoting a teammate.`;
  if (language === "english") {
    return `${base} Do NOT use Chinese, Japanese, or Korean. Use English headings only (e.g. ## Stack & layout), never CJK characters or kana.`;
  }
  return base;
}

export function buildArtifactLanguageDirective(productIdea: string): string {
  const language = detectProductLanguage(productIdea);
  const label = productLanguageLabel(language);
  const base = `The product idea is written in ${label}. You MUST write this entire artifact, including all section titles, in ${label}. Do not switch languages.`;
  if (language === "english") {
    return `${base} Do NOT use Chinese, Japanese, or Korean characters.`;
  }
  return base;
}
