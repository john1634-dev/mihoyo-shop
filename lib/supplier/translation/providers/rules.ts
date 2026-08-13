/**
 * Rule-based Vietnamese → English title translation for supplier listings.
 * Preserves game codes, constellation/refinement markers, and numeric tokens.
 *
 * Default provider when no external translation API is configured.
 */

const PROTECTED_PATTERNS: RegExp[] = [
  /\bH\d+\b/gi,
  /\b[CE]\d+\b/gi,
  /\bR\d+\b/gi,
  /\bS\d+\b/gi,
  /\b(?:Lv|LV|AR|UID)\s*\d+\b/gi,
  /\b\d+(?:[.,]\d+)?\b/g,
];

/** Longest phrases first to avoid partial replacements. */
const PHRASE_DICTIONARY: [string, string][] = [
  ["và những người bạn", "and Friends"],
  ["va nhung nguoi ban", "and Friends"],
  ["và đồng đội", "and Teammates"],
  ["va dong doi", "and Teammates"],
  ["nguồn cn", "CN Server"],
  ["nguon cn", "CN Server"],
  ["nguồn na", "NA Server"],
  ["nguon na", "NA Server"],
  ["nguồn eu", "EU Server"],
  ["nguon eu", "EU Server"],
  ["nguồn asia", "Asia Server"],
  ["nguon asia", "Asia Server"],
  ["nguồn", "Server"],
  ["nguon", "Server"],
  ["columbina", "Columbina"],
  ["colum", "Columbina"],
  ["wanderer", "Wanderer"],
  ["nahida", "Nahida"],
  ["neuvillette", "Neuvillette"],
  ["neu", "Neu"],
  ["yae", "Yae"],
  ["sand", "Sand"],
  ["raiden", "Raiden"],
  ["zhongli", "Zhongli"],
  ["kazuha", "Kazuha"],
  ["venti", "Venti"],
  ["và", "and"],
  ["va", "and"],
];

export type ProtectedTokenMap = {
  text: string;
  tokens: string[];
};

export function protectTokens(input: string): ProtectedTokenMap {
  const tokens: string[] = [];
  let text = input;

  for (const pattern of PROTECTED_PATTERNS) {
    text = text.replace(pattern, (match) => {
      const key = `__TK${tokens.length}__`;
      tokens.push(match);
      return key;
    });
  }

  return { text, tokens };
}

export function restoreTokens(text: string, tokens: string[]): string {
  let restored = text;
  for (let i = 0; i < tokens.length; i += 1) {
    const pattern = new RegExp(`__TK${i}__`, "gi");
    restored = restored.replace(pattern, tokens[i]);
  }
  return restored;
}

function normalizeSourceText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCaseWord(word: string): string {
  if (!word) return word;
  if (/^__TK\d+__$/.test(word)) return word;
  if (/^[A-Z0-9]+$/.test(word)) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function polishEnglishTitle(text: string): string {
  return text
    .split(/\s+/)
    .map((word) => {
      if (/^__TK\d+__$/i.test(word)) return word.toUpperCase();
      if (/^c\d+$/i.test(word)) return word.toUpperCase();
      if (/^e\d+$/i.test(word)) return word.toUpperCase();
      if (/^r\d+$/i.test(word)) return word.toUpperCase();
      if (/^s\d+$/i.test(word)) return word.toUpperCase();
      if (/^h\d+$/i.test(word)) return word.toUpperCase();
      if (/^[A-Z0-9]+$/.test(word)) return word;
      return toTitleCaseWord(word);
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function applyPhraseDictionary(text: string): string {
  const parts = text.split(/(__TK\d+__)/gi);

  return parts
    .map((part) => {
      if (/^__TK\d+__$/i.test(part)) {
        return part.toUpperCase();
      }

      let segment = part.toLowerCase();
      for (const [sourcePhrase, targetPhrase] of PHRASE_DICTIONARY) {
        segment = segment.split(sourcePhrase).join(targetPhrase);
      }
      return segment;
    })
    .join("");
}

export function translateWithRules(sourceText: string): {
  translatedText: string;
  confidence: number;
} {
  const normalized = normalizeSourceText(sourceText);
  if (!normalized) {
    return { translatedText: sourceText, confidence: 0 };
  }

  const { text, tokens } = protectTokens(normalized);
  let translated = applyPhraseDictionary(text);
  translated = restoreTokens(translated, tokens);
  translated = polishEnglishTitle(translated);

  const changed = translated.toLowerCase() !== normalized.toLowerCase();
  const confidence = changed ? 0.85 : 0.6;

  return { translatedText: translated, confidence };
}
