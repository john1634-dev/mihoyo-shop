import { protectTokens, restoreTokens } from "./rules";

const DEFAULT_GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
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
    process.env.TRANSLATION_API_BASE_URL?.trim() ||
    DEFAULT_GEMINI_BASE_URL
  ).replace(/\/+$/, "");

  const model =
    process.env.TRANSLATION_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

  return { apiKey, baseUrl, model };
}

function extractGeminiText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const candidates = (payload as { candidates?: unknown }).candidates;

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const content = (
    candidates[0] as {
      content?: {
        parts?: unknown;
      };
    }
  ).content;

  const parts = content?.parts;

  if (!Array.isArray(parts)) {
    return null;
  }

  const text = parts
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const value = (part as { text?: unknown }).text;
      return typeof value === "string" ? value : "";
    })
    .join("")
    .trim();

  return text || null;
}

function protectedTokensPreserved(
  sourceText: string,
  translatedText: string,
): boolean {
  const { tokens } = protectTokens(sourceText);
  const haystack = translatedText.toLowerCase();

  return tokens.every((token) =>
    haystack.includes(token.toLowerCase()),
  );
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

  const timer = setTimeout(() => {
    controller.abort();
  }, TRANSLATION_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: AI_TITLE_TRANSLATION_PROMPT,
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Translate this Vietnamese game-account title to English:\n${text}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
          },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Gemini translation HTTP ${response.status}${
          errorText ? `: ${errorText.slice(0, 300)}` : ""
        }`,
      );
    }

    const payload: unknown = await response.json();

    const raw = extractGeminiText(payload);

    if (!raw) {
      throw new Error("Gemini translation returned an empty title.");
    }

    const restored = restoreTokens(raw, tokens)
      .replace(/^["']|["']$/g, "")
      .trim();

    if (!restored) {
      throw new Error("Gemini translation returned an empty title.");
    }

    if (!protectedTokensPreserved(sourceText, restored)) {
      throw new Error("Gemini translation dropped protected title tokens.");
    }

    return {
      translatedText: restored,
      confidence: 0.9,
      model,
    };
  } finally {
    clearTimeout(timer);
  }
}