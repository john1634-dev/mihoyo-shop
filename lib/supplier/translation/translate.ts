import type {
  SupplierTranslationResult,
  TranslateSupplierTitleOptions,
} from "./types";
import { translateWithAi } from "./providers/ai";
import { translateWithRules } from "./providers/rules";

export type TranslationProviderName = "ai" | "rules" | "none";

export function getConfiguredTranslationProvider(): TranslationProviderName {
  const raw = process.env.TRANSLATION_PROVIDER?.trim().toLowerCase();
  if (raw === "none") return "none";
  if (raw === "ai") return "ai";
  return "rules";
}

function buildResult(
  partial: Omit<SupplierTranslationResult, "sourceText"> & { sourceText?: string },
  sourceText: string
): SupplierTranslationResult {
  return {
    sourceText,
    ...partial,
  };
}

/**
 * Translate a supplier listing title via configured provider abstraction.
 * Never throws — returns failed status with original text on error.
 */
export async function translateSupplierTitle(
  text: string,
  options: TranslateSupplierTitleOptions = {}
): Promise<SupplierTranslationResult> {
  const sourceText = text.trim();
  const sourceLanguage = options.sourceLanguage ?? "vi";
  const targetLanguage = options.targetLanguage ?? "en";
  const provider = options.provider ?? getConfiguredTranslationProvider();

  if (!sourceText) {
    return buildResult(
      {
        status: "skipped",
        sourceLanguage,
        targetLanguage,
        translatedText: text,
        provider,
        confidence: 0,
        error: "Empty title.",
      },
      text
    );
  }

  try {
    if (provider === "none") {
      return buildResult(
        {
          status: "skipped",
          sourceLanguage,
          targetLanguage,
          translatedText: sourceText,
          provider,
          confidence: 1,
        },
        sourceText
      );
    }

    if (provider === "ai") {
      const { translatedText, confidence } = await translateWithAi(sourceText);
      return buildResult(
        {
          status: "completed",
          sourceLanguage,
          targetLanguage,
          translatedText,
          provider: "ai",
          confidence,
        },
        sourceText
      );
    }

    if (provider === "rules") {
      const { translatedText, confidence } = translateWithRules(sourceText);
      return buildResult(
        {
          status: "completed",
          sourceLanguage,
          targetLanguage,
          translatedText,
          provider: "rules",
          confidence,
        },
        sourceText
      );
    }

    return buildResult(
      {
        status: "failed",
        sourceLanguage,
        targetLanguage,
        translatedText: sourceText,
        provider,
        error: `Unsupported translation provider: ${provider}`,
      },
      sourceText
    );
  } catch (error) {
    return buildResult(
      {
        status: "failed",
        sourceLanguage,
        targetLanguage,
        translatedText: sourceText,
        provider,
        error: error instanceof Error ? error.message : "Translation failed.",
      },
      sourceText
    );
  }
}
