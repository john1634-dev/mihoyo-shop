import "server-only";

import { getVndToMyrRate } from "@/lib/exchange-rate";
import {
  buildStorefrontTitleFromSupplierTitle,
  extractSupplierAccountCode,
} from "@/lib/supplier/account-code";
import type { ImportStatusInfo } from "@/lib/supplier/import";
import {
  calculateSupplierSellingPrice,
  getDefaultMarkupPercent,
} from "@/lib/supplier/pricing";
import type { SupplierProduct } from "@/lib/supplier/types";

export type SupplierPreviewResult = {
  source: string;
  originalTitle: string;
  /** Storefront title — supplier account code only (e.g. H4723). */
  translatedTitle: string;
  accountCode: string | null;
  accountCodeMissing: boolean;
  /** @deprecated Kept for admin UI compatibility — mirrors accountCodeMissing. */
  translationFailed: boolean;
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
  exchangeRate?: number;
};

/**
 * Enrich normalized supplier product with account-code title + pricing for admin preview.
 * No database or storage writes. Does not call AI/rule translation.
 */
export async function buildSupplierProductPreview(
  product: SupplierProduct,
  options: BuildSupplierPreviewOptions = {}
): Promise<SupplierPreviewResult> {
  const originalTitle = product.title.trim();
  const accountCode = buildStorefrontTitleFromSupplierTitle(originalTitle);
  const accountCodeMissing = !accountCode;
  const translatedTitle = accountCode ?? originalTitle;

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
    accountCode,
    accountCodeMissing,
    translationFailed: accountCodeMissing,
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

export { extractSupplierAccountCode };
