/** Stable region codes for catalog filters and admin (Phase 5.1). */
export const REGION_OPTIONS = [
  { code: "GLOBAL", label: "Global" },
  { code: "ASIA", label: "Asia" },
  { code: "AMERICA", label: "America" },
  { code: "EUROPE", label: "Europe" },
  { code: "JAPAN", label: "Japan" },
  { code: "KOREA", label: "Korea" },
  { code: "TAIWAN", label: "Taiwan" },
  { code: "SEA", label: "SEA" },
] as const;

export type RegionCode = (typeof REGION_OPTIONS)[number]["code"];

export const SUPPORTED_CURRENCIES = ["MYR", "USD"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function normalizeRegionCode(
  value?: string | null
): string | null {
  const code = value?.trim().toUpperCase();
  if (!code) return null;
  return code;
}

export function getRegionLabel(code?: string | null): string | null {
  const normalized = normalizeRegionCode(code);
  if (!normalized) return null;
  const match = REGION_OPTIONS.find((option) => option.code === normalized);
  return match?.label ?? normalized;
}

export function normalizeCurrencyCode(
  value?: string | null,
  fallback = "MYR"
): string {
  const code = value?.trim().toUpperCase();
  if (!code) return fallback;
  return code;
}

export function isSupportedCurrency(value?: string | null): value is SupportedCurrency {
  const code = normalizeCurrencyCode(value, "");
  return SUPPORTED_CURRENCIES.includes(code as SupportedCurrency);
}
