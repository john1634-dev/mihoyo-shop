import "server-only";

import { getVndToMyrRate } from "@/lib/exchange-rate";
import {
  calculateSupplierSellingPrice,
  getDefaultMarkupPercent,
} from "@/lib/supplier/pricing";
import type { ImportStatusInfo } from "@/lib/supplier/import";
import { translateSupplierTitle } from "@/lib/supplier/translation";
import type { SupplierProduct } from "@/lib/supplier/types";

export type SupplierPreviewResult = {
  source: string;
  originalTitle: string;
  translatedTitle: string;
  translationFailed: boolean;
  translation: Awaited<ReturnType<typeof translateSupplierTitle>>;
  sourcePrice: number;
  sourceCurrency: string;
  costMyr: number | null;
  markupPercent: number;
  sellingPriceMyr: number | null;
  profitMyr: number | null;
  exchangeRate: number | null;
  exchangeRateUpdatedAt: string | null;
  exchangeRateSource: string | null;
  pricingError: string | null;
  product: SupplierProduct;
  images: SupplierProduct["images"];
  importStatus?: ImportStatusInfo;
};

export type BuildSupplierPreviewOptions = {
  markupPercent?: number;
  translationProvider?: string;
  exchangeRate?: number;
};

/**
 * Enrich normalized supplier product with translation + pricing for admin preview.
 * No database or storage writes.
 */
export async function buildSupplierProductPreview(
  product: SupplierProduct,
  options: BuildSupplierPreviewOptions = {}
): Promise<SupplierPreviewResult> {
  const originalTitle = product.title.trim();
  const translation = await translateSupplierTitle(originalTitle, {
    sourceLanguage: "vi",
    targetLanguage: "en",
    provider: options.translationProvider,
  });

  const translationFailed = translation.status === "failed";
  const translatedTitle = translationFailed
    ? originalTitle
    : translation.translatedText;

  const markupPercent =
    options.markupPercent ?? getDefaultMarkupPercent(product.source);

  let costMyr: number | null = null;
  let sellingPriceMyr: number | null = null;
  let profitMyr: number | null = null;
  let exchangeRate: number | null = null;
  let exchangeRateUpdatedAt: string | null = null;
  let exchangeRateSource: string | null = null;
  let pricingError: string | null = null;

  if (product.price > 0 && product.currency.trim().toUpperCase() === "VND") {
    try {
      if (
        options.exchangeRate != null &&
        Number.isFinite(options.exchangeRate) &&
        options.exchangeRate > 0
      ) {
        exchangeRate = options.exchangeRate;
        exchangeRateSource = "provided";
      } else {
        const rateResult = await getVndToMyrRate();
        exchangeRate = rateResult.rate;
        exchangeRateUpdatedAt = rateResult.updatedAt;
        exchangeRateSource = rateResult.source;
      }

      if (exchangeRate == null || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
        throw new Error("Invalid exchange rate.");
      }

      const pricing = calculateSupplierSellingPrice({
        supplierPrice: product.price,
        supplierCurrency: "VND",
        markupPercent,
        exchangeRate,
      });

      costMyr = pricing.costMyr;
      sellingPriceMyr = pricing.sellingPriceMyr;
      profitMyr = pricing.profitMyr;
    } catch (error) {
      pricingError =
        error instanceof Error ? error.message : "Unable to calculate pricing.";
    }
  } else if (product.price <= 0) {
    pricingError = "Supplier price unavailable.";
  } else {
    pricingError = `Unsupported supplier currency: ${product.currency}.`;
  }

  return {
    source: product.source,
    originalTitle,
    translatedTitle,
    translationFailed,
    translation,
    sourcePrice: product.price,
    sourceCurrency: product.currency.trim().toUpperCase() || "VND",
    costMyr,
    markupPercent,
    sellingPriceMyr,
    profitMyr,
    exchangeRate,
    exchangeRateUpdatedAt,
    exchangeRateSource,
    pricingError,
    product,
    images: product.images,
  };
}
