import { computeCostMyr, computeProfit } from "@/lib/costing";

export type SupplierPricingInput = {
  supplierPrice: number;
  supplierCurrency: string;
  markupPercent: number;
  exchangeRate: number;
};

export type SupplierPricingResult = {
  supplierPrice: number;
  supplierCurrency: string;
  markupPercent: number;
  exchangeRate: number;
  costMyr: number;
  sellingPriceMyr: number;
  profitMyr: number;
};

export class SupplierPricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupplierPricingError";
  }
}

/** Default markup percent for ZinkGame supplier previews / import. */
export function getDefaultMarkupPercent(source?: string): number {
  const normalized = source?.trim().toLowerCase();
  if (normalized === "zinkgame") {
    const raw = process.env.ZINKGAME_DEFAULT_MARKUP_PERCENT?.trim();
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }

  return 100;
}

/** Max allowed selling-price change percent for automatic ZinkGame price sync. */
export function getMaxAutoPriceChangePercent(source?: string): number {
  const normalized = source?.trim().toLowerCase();
  if (normalized === "zinkgame") {
    const raw = process.env.ZINKGAME_MAX_AUTO_PRICE_CHANGE_PERCENT?.trim();
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }

  return 30;
}

/** Absolute percent change between old and new selling prices. */
export function calculateSellingPriceChangePercent(
  oldSellingPrice: number,
  newSellingPrice: number
): number {
  if (!Number.isFinite(oldSellingPrice) || oldSellingPrice <= 0) {
    return newSellingPrice === oldSellingPrice ? 0 : 100;
  }
  return (
    Math.round(
      (Math.abs(newSellingPrice - oldSellingPrice) / oldSellingPrice) * 10000
    ) / 100
  );
}

/** Whether automatic price sync is allowed under configured threshold. */
export function isAutoPriceChangeAllowed(
  oldSellingPrice: number,
  newSellingPrice: number,
  maxChangePercent: number
): boolean {
  return (
    calculateSellingPriceChangePercent(oldSellingPrice, newSellingPrice) <=
    maxChangePercent
  );
}

/**
 * Calculate MYR cost, markup selling price, and profit from supplier VND price.
 *
 * sellingPrice = costMyr × (1 + markupPercent / 100)
 */
export function calculateSupplierSellingPrice(
  input: SupplierPricingInput
): SupplierPricingResult {
  const supplierPrice = input.supplierPrice;
  const supplierCurrency = input.supplierCurrency.trim().toUpperCase();
  const markupPercent = input.markupPercent;
  const exchangeRate = input.exchangeRate;

  if (!Number.isFinite(supplierPrice) || supplierPrice < 0) {
    throw new SupplierPricingError("Invalid supplier price.");
  }

  if (supplierCurrency !== "VND") {
    throw new SupplierPricingError(
      `Unsupported supplier currency: ${supplierCurrency || "unknown"}.`
    );
  }

  if (!Number.isFinite(markupPercent) || markupPercent < 0) {
    throw new SupplierPricingError("Markup percent cannot be negative.");
  }

  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new SupplierPricingError("Invalid exchange rate.");
  }

  const costMyr = computeCostMyr(supplierPrice, exchangeRate);
  const sellingPriceMyr =
    Math.round(costMyr * (1 + markupPercent / 100) * 100) / 100;
  const { profit: profitMyr } = computeProfit(sellingPriceMyr, costMyr);

  return {
    supplierPrice,
    supplierCurrency,
    markupPercent,
    exchangeRate,
    costMyr,
    sellingPriceMyr,
    profitMyr,
  };
}
