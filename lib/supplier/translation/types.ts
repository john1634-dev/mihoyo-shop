export type SupplierTranslationStatus = "completed" | "failed" | "skipped";

export type SupplierTranslationResult = {
  status: SupplierTranslationStatus;
  sourceLanguage: string;
  targetLanguage: string;
  sourceText: string;
  translatedText: string;
  provider: string;
  confidence?: number;
  error?: string;
};

export type TranslateSupplierTitleOptions = {
  sourceLanguage?: string;
  targetLanguage?: string;
  provider?: string;
};
