import { logServerError } from "@/lib/errors";

export type ExchangeRateResult = {
  from: "VND";
  to: "MYR";
  rate: number;
  updatedAt: string;
  source: string;
};

type CacheEntry = {
  value: ExchangeRateResult;
  expiresAt: number;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const SOURCE = "open.er-api.com";

let cacheEntry: CacheEntry | null = null;

function isValidRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

async function fetchWithTimeout(input: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function getVndToMyrRate(
  forceRefresh = false
): Promise<ExchangeRateResult> {
  const now = Date.now();

  if (!forceRefresh && cacheEntry && cacheEntry.expiresAt > now) {
    return cacheEntry.value;
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      "https://open.er-api.com/v6/latest/VND",
      FETCH_TIMEOUT_MS
    );
  } catch (error) {
    logServerError("exchange rate fetch", error);
    throw new Error("Unable to fetch exchange rate right now.");
  }

  if (!response.ok) {
    throw new Error(`Exchange rate service unavailable (${response.status}).`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Exchange rate response was not valid JSON.");
  }

  const rate = (payload as { rates?: { MYR?: unknown } })?.rates?.MYR;
  if (!isValidRate(rate)) {
    throw new Error("Exchange rate response did not include a valid MYR rate.");
  }

  const updatedAt =
    typeof (payload as { time_last_update_utc?: unknown })?.time_last_update_utc ===
    "string"
      ? new Date(
          (payload as { time_last_update_utc: string }).time_last_update_utc
        ).toISOString()
      : new Date().toISOString();

  const result: ExchangeRateResult = {
    from: "VND",
    to: "MYR",
    rate,
    updatedAt,
    source: SOURCE,
  };

  cacheEntry = {
    value: result,
    expiresAt: now + CACHE_TTL_MS,
  };

  return result;
}
