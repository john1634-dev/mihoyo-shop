import { protectTokens, restoreTokens } from "./rules";

const DEFAULT_AI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_AI_MODEL = "gpt-4o-mini";
const TRANSLATION_TIMEOUT_MS = 20_000;

export const AI_TITLE_TRANSLATION_PROMPT = `You translate Vietnamese game-account listing titles into concise English storefront titles.

Rules:
- Translate Vietnamese words into natural English.
- Preserve exactly: character names, game names, server names, C0/C1/C2/C6, E0/E1/E6, S1/S2/S5, Lv, AR, UID, product codes, account IDs, numbers, and model/version identifiers.
- Do not invent character names.
- Do not translate account IDs or product codes such as H4702.
- Keep the title concise and suitable for an English game-account storefront.
- Return ONLY the translated title. No quotes. No explanation.`;

export function getAiTranslationConfig(): {
  apiKey: string | null;
  baseUrl: string;
  model: string;
} {
  const apiKey = process.env.TRANSLATION_API_KEY?.trim() || null;
  const baseUrl = (
    process.env.TRANSLATION_API_BASE_URL?.trim() || DEFAULT_AI_BASE_URL
  ).replace(/\/+$/, "");
  const model = process.env.TRANSLATION_MODEL?.trim() || DEFAULT_AI_MODEL;
  return { apiKey, baseUrl, model };
}

function extractChoiceText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;
  if (typeof content !== "string") return null;
  return content.trim() || null;
}

function protectedTokensPreserved(sourceText: string, translatedText: string): boolean {
  const { tokens } = protectTokens(sourceText);
  const haystack = translatedText.toLowerCase();
  return tokens.every((token) => haystack.includes(token.toLowerCase()));
}

export async function translateWithAi(sourceText: string): Promise<{
  translatedText: string;
  confidence: number;
  model: string;
}> {
  const { apiKey, baseUrl, model } = getAiTranslationConfig();
  if (!apiKey) {
    throw new Error("TRANSLATION_API_KEY is not configured.");
  }

  const { text, tokens } = protectTokens(sourceText);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSLATION_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: AI_TITLE_TRANSLATION_PROMPT },
          {
            role: "user",
            content: `Translate this Vietnamese game-account title to English:\n${text}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`AI translation HTTP ${response.status}.`);
    }

    const payload: unknown = await response.json();
    const raw = extractChoiceText(payload);
    if (!raw) {
      throw new Error("AI translation returned an empty title.");
    }

    const restored = restoreTokens(raw, tokens).replace(/^["']|["']$/g, "").trim();
    if (!restored) {
      throw new Error("AI translation returned an empty title.");
    }

    if (!protectedTokensPreserved(sourceText, restored)) {
      throw new Error("AI translation dropped protected title tokens.");
    }

    return { translatedText: restored, confidence: 0.9, model };
  } finally {
    clearTimeout(timer);
  }
}
