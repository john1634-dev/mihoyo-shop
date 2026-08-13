import "server-only";

import {
  getZinkGameBaseUrl,
  isAllowedZinkGameUrl,
} from "@/lib/supplier/config";
import {
  getAllowedCategoryUrl,
  resolveAllowedCategorySlug,
} from "@/lib/supplier/zinkgame/categories";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_RETRIES = 2;
const USER_AGENT =
  "BaituGames-SupplierBot/1.0 (+https://www.baitugames.com; supplier-preview)";

export type ZinkGameFetchResult = {
  url: string;
  status: number;
  contentType: string | null;
  html: string;
};

export class ZinkGameFetchError extends Error {
  readonly url: string;
  readonly status?: number;

  constructor(message: string, url: string, status?: number) {
    super(message);
    this.name = "ZinkGameFetchError";
    this.url = url;
    this.status = status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Validates and resolves a ZinkGame URL against configured base (SSRF-safe). */
export function resolveZinkGameUrl(pathOrUrl: string): URL {
  const baseUrl = getZinkGameBaseUrl();
  const trimmed = pathOrUrl.trim();
  if (!trimmed) {
    throw new ZinkGameFetchError("Empty URL.", baseUrl);
  }

  let resolved: URL;
  try {
    resolved = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? new URL(trimmed)
      : new URL(trimmed.startsWith("/") ? trimmed : `/${trimmed}`, baseUrl);
  } catch {
    throw new ZinkGameFetchError("Invalid URL.", trimmed);
  }

  if (!isAllowedZinkGameUrl(resolved.toString())) {
    throw new ZinkGameFetchError(
      "URL host is not allowed for ZinkGame adapter.",
      resolved.toString()
    );
  }

  return resolved;
}

export function buildZinkGameProductUrl(productId: string): URL {
  const id = productId.trim();
  if (!/^[a-f0-9]{32}$/i.test(id)) {
    throw new ZinkGameFetchError("Invalid ZinkGame product id.", id);
  }
  return resolveZinkGameUrl(`/product/${id}`);
}

export function buildZinkGameListingUrl(page: number): URL {
  if (!Number.isInteger(page) || page < 1) {
    throw new ZinkGameFetchError("Invalid listing page.", String(page));
  }
  const base = resolveZinkGameUrl("/");
  if (page === 1) return base;
  base.searchParams.set("page", String(page));
  return base;
}

/** Allowlisted account-category URL only — never homepage or arbitrary paths. */
export function buildZinkGameCategoryUrl(category: string, page = 1): URL {
  const slug = resolveAllowedCategorySlug(category);
  if (!slug) {
    throw new ZinkGameFetchError(
      "Category is not allowlisted for ZinkGame auto-import.",
      category
    );
  }

  const allowed = getAllowedCategoryUrl(slug);
  if (!allowed) {
    throw new ZinkGameFetchError(
      "Category URL failed host validation.",
      category
    );
  }

  if (!Number.isInteger(page) || page < 1) {
    throw new ZinkGameFetchError("Invalid category page.", String(page));
  }

  const url = resolveZinkGameUrl(allowed);
  if (page > 1) {
    url.searchParams.set("page", String(page));
  }
  return url;
}

async function readResponseTextLimited(
  response: Response,
  maxBytes: number
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (text.length > maxBytes) {
      throw new ZinkGameFetchError(
        `Response exceeds ${maxBytes} bytes.`,
        response.url,
        response.status
      );
    }
    return text;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ZinkGameFetchError(
        `Response exceeds ${maxBytes} bytes.`,
        response.url,
        response.status
      );
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

export async function fetchZinkGameHtml(
  pathOrUrl: string,
  options: { timeoutMs?: number } = {}
): Promise<ZinkGameFetchResult> {
  const url = resolveZinkGameUrl(pathOrUrl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": USER_AGENT,
        },
        redirect: "follow",
        signal: controller.signal,
        cache: "no-store",
      });

      const contentType = response.headers.get("content-type");
      const html = await readResponseTextLimited(response, MAX_RESPONSE_BYTES);

      if (process.env.NODE_ENV === "development") {
        console.info("[zinkgame:fetch]", {
          url: url.toString(),
          status: response.status,
          bytes: html.length,
        });
      }

      return {
        url: url.toString(),
        status: response.status,
        contentType,
        html,
      };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(250 * (attempt + 1));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  const message =
    lastError instanceof Error && lastError.name === "AbortError"
      ? "Request timed out."
      : lastError instanceof Error
        ? lastError.message
        : "Request failed.";

  throw new ZinkGameFetchError(message, url.toString());
}
