const VND_NUMBER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const MYR_NUMBER = new Intl.NumberFormat("en-MY", {
  style: "currency",
  currency: "MYR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const RATE_NUMBER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 8,
  maximumFractionDigits: 8,
});

export const MAX_COST_VND = 999_999_999_999;

export function formatVnd(value: number): string {
  return `${VND_NUMBER.format(value)} VND`;
}

export function formatMyr(value: number): string {
  return MYR_NUMBER.format(value);
}

export function formatRate(value: number): string {
  return RATE_NUMBER.format(value);
}

export function parseVndInput(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const value = Number(digits);
  if (!Number.isFinite(value)) return null;
  if (value < 0 || value > MAX_COST_VND) return null;
  return value;
}

export function formatVndInput(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  const value = Number(digits);
  if (!Number.isFinite(value)) return "";
  return VND_NUMBER.format(value);
}

export function computeCostMyr(costVnd: number, rate: number): number {
  return Math.round(costVnd * rate * 100) / 100;
}

export function computeProfit(sellingPrice: number, costMyr: number): {
  profit: number;
  margin: number;
} {
  const profit = Math.round((sellingPrice - costMyr) * 100) / 100;
  const margin =
    sellingPrice > 0 ? Math.round((profit / sellingPrice) * 10000) / 100 : 0;
  return { profit, margin };
}
