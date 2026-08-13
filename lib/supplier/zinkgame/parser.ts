import type { SupplierSourceStatus } from "@/lib/supplier/status";
import { getZinkGameBaseUrl } from "@/lib/supplier/config";

export const ZINKGAME_PRODUCT_ID_PATTERN = /^[a-f0-9]{32}$/i;

export type ParsedListingItem = {
  externalProductId: string;
  externalProductUrl: string;
  title: string | null;
  coverImageUrl: string | null;
  sourcePrice: number | null;
  sourceCurrency: string | null;
};

export type ParsedDetail = {
  externalProductId: string | null;
  externalProductUrl: string | null;
  title: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  images: ParsedImage[];
  status: SupplierSourceStatus;
  metadata: Record<string, unknown>;
};

export type ParsedImage = {
  url: string;
  sortOrder: number;
  role: "cover" | "gallery";
};

export type ListingParseResult = {
  items: ParsedListingItem[];
  pagination: "none" | "not_detected" | "query";
  warnings: string[];
};

/** Parse Vietnamese dong price strings — integer only, no float math. */
export function parseVndPrice(raw: string | null | undefined): {
  amount: number;
  currency: "VND";
} | null {
  if (!raw) return null;
  const normalized = raw.replace(/\u00a0/g, " ").trim();
  const match = normalized.match(/([\d][\d.,\s]*)\s*(?:đ|VND|vnd)/i);
  if (!match) return null;

  const digitsOnly = match[1].replace(/[^\d]/g, "");
  if (!digitsOnly) return null;

  const amount = Number.parseInt(digitsOnly, 10);
  if (!Number.isFinite(amount) || amount < 0) return null;

  return { amount, currency: "VND" };
}

export function extractProductIdFromUrl(urlOrPath: string): string | null {
  const trimmed = urlOrPath.trim();
  if (!trimmed) return null;

  try {
    const pathname = trimmed.startsWith("http")
      ? new URL(trimmed).pathname
      : trimmed.split("?")[0];
    const match = pathname.match(/\/product\/([a-f0-9]{32})/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    const match = trimmed.match(/\/product\/([a-f0-9]{32})/i);
    return match?.[1]?.toLowerCase() ?? null;
  }
}

/** Resolve relative href to absolute URL using URL API. */
export function toAbsoluteUrl(
  href: string | null | undefined,
  baseUrl?: string
): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("javascript:") || trimmed.startsWith("#")) {
    return null;
  }

  try {
    const base = baseUrl ?? getZinkGameBaseUrl();
    return new URL(trimmed, base.endsWith("/") ? base : `${base}/`).toString();
  } catch {
    return null;
  }
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16))
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtmlTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "))
    .trim();
}

function extractFirstMatch(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match?.[1] ?? null;
}

/** Read an attribute value from the first tag matching `tagPattern`. */
function extractTagAttribute(
  html: string,
  tagPattern: RegExp,
  attribute: string
): string | null {
  const tagMatch = html.match(tagPattern);
  if (!tagMatch) return null;
  const tag = tagMatch[0];
  const attrMatch = tag.match(
    new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']+)["']`, "i")
  );
  return attrMatch?.[1] ?? null;
}

function detectListingPagination(html: string): ListingParseResult["pagination"] {
  if (/[?&]page=\d+/i.test(html)) return "query";
  if (/href=['"][^'"]*\/page\/\d+['"]/i.test(html)) return "query";
  if (/__doPostBack\s*\(\s*['"][^'"]*page/i.test(html)) return "query";
  return "not_detected";
}

/** Parse ZinkGame homepage / listing HTML for product discovery. */
export function parseListingHtml(
  html: string,
  baseUrl?: string
): ListingParseResult {
  const base = baseUrl ?? getZinkGameBaseUrl();
  const warnings: string[] = [];
  const items: ParsedListingItem[] = [];
  const seen = new Set<string>();

  const cardRegex =
    /<a\s+href=['"]\/product\/([a-f0-9]{32})['"][^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = cardRegex.exec(html)) !== null) {
    const productId = match[1].toLowerCase();
    if (seen.has(productId)) continue;
    seen.add(productId);

    const inner = match[2];
    const externalProductUrl =
      toAbsoluteUrl(`/product/${productId}`, base) ?? `${base}/product/${productId}`;

    const imgMatch = inner.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
    const coverImageUrl = toAbsoluteUrl(imgMatch?.[1] ?? null, base);

    const titleMatch = inner.match(
      /<div[^>]*>\s*([^<]+?)\s*<\/div>\s*<div[^>]*>\s*<span/i
    );
    const titleRaw = titleMatch?.[1]?.trim() ?? null;
    const title = titleRaw ? decodeHtmlEntities(titleRaw) : null;

    const priceBlock = inner.replace(/<span[^>]*class=['"][^'"]*hide[^'"]*['"][^>]*>[\s\S]*?<\/span>/gi, "");
    const priceMatch = priceBlock.match(/>([^<]*\d[\d.,\s]*(?:đ|VND)[^<]*)</i);
    const parsedPrice = parseVndPrice(priceMatch?.[1] ?? null);

    items.push({
      externalProductId: productId,
      externalProductUrl,
      title,
      coverImageUrl,
      sourcePrice: parsedPrice?.amount ?? null,
      sourceCurrency: parsedPrice?.currency ?? null,
    });
  }

  if (items.length === 0) {
    warnings.push("No product cards found in listing HTML.");
  }

  const pagination = detectListingPagination(html);

  return { items, pagination, warnings };
}

function detectDetailStatus(html: string, httpStatus?: number): SupplierSourceStatus {
  if (httpStatus === 404) return "delisted";
  if (httpStatus != null && httpStatus >= 500) return "unavailable";

  const soldPatterns = [
    /\bđã\s+bán\b/i,
    /\bda\s+ban\b/i,
    /\bsold\b/i,
    /\bhết\s+hàng\b/i,
    /\bhet\s+hang\b/i,
  ];
  if (soldPatterns.some((p) => p.test(html))) return "sold";

  const orderMatch = html.match(/<a[^>]*id=["']order["'][^>]*>([\s\S]*?)<\/a>/i);
  if (orderMatch) {
    const orderText = stripHtmlTags(orderMatch[1]);
    if (/đặt\s+hàng|dat\s+hang|order/i.test(orderText)) {
      return "active";
    }
  }

  const orderBlockHidden = /id=["']orderBlock["'][^>]*style=["'][^"']*display\s*:\s*none/i.test(
    html
  );
  if (orderBlockHidden) return "sold";

  if (httpStatus != null && httpStatus >= 400) return "unavailable";

  return "unknown";
}

function extractImagesFromInfo(
  infoHtml: string,
  baseUrl: string,
  startOrder: number
): ParsedImage[] {
  const images: ParsedImage[] = [];
  const imgRegex = /<img[^>]+src=['"]([^'"]+)['"][^>]*>/gi;
  let match: RegExpExecArray | null;
  let order = startOrder;

  while ((match = imgRegex.exec(infoHtml)) !== null) {
    const absolute = toAbsoluteUrl(match[1], baseUrl);
    if (!absolute) continue;
    images.push({ url: absolute, sortOrder: order, role: "gallery" });
    order += 1;
  }

  return images;
}

/** Parse ZinkGame product detail HTML. Missing fields return null — never fabricated. */
export function parseDetailHtml(
  html: string,
  options: {
    baseUrl?: string;
    productUrl?: string | null;
    httpStatus?: number;
  } = {}
): ParsedDetail {
  const base = options.baseUrl ?? getZinkGameBaseUrl();
  const warnings: string[] = [];

  const productIdRaw = extractFirstMatch(
    html,
    /id=["']productID["'][^>]*value=["']([a-f0-9]{32})["']/i
  );
  const productIdFromUrl = options.productUrl
    ? extractProductIdFromUrl(options.productUrl)
    : null;
  const externalProductId = (productIdRaw ?? productIdFromUrl)?.toLowerCase() ?? null;

  const titleRaw = extractFirstMatch(html, /id=["']title["'][^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleRaw ? stripHtmlTags(titleRaw) : null;

  const priceRaw = extractFirstMatch(html, /id=["']price["'][^>]*>([\s\S]*?)<\/span>/i);
  const parsedPrice = parseVndPrice(priceRaw);

  const avatarSrc = extractTagAttribute(
    html,
    /<img[^>]*\bid=["']avatar["'][^>]*>/i,
    "src"
  );
  const coverUrl = toAbsoluteUrl(avatarSrc, base);

  const infoRaw = extractFirstMatch(html, /id=["']info["'][^>]*>([\s\S]*?)<\/div>/i);
  const description = infoRaw ? infoRaw.trim() : null;

  const images: ParsedImage[] = [];
  if (coverUrl) {
    images.push({ url: coverUrl, sortOrder: 0, role: "cover" });
  }
  if (infoRaw) {
    images.push(...extractImagesFromInfo(infoRaw, base, images.length));
  }

  const categoryRaw = extractFirstMatch(
    html,
    /id=["']category["'][^>]*>([\s\S]*?)<\/span>/i
  );
  const category = categoryRaw ? stripHtmlTags(categoryRaw) : null;

  const status = detectDetailStatus(html, options.httpStatus);

  const externalProductUrl =
    externalProductId != null
      ? toAbsoluteUrl(`/product/${externalProductId}`, base)
      : options.productUrl ?? null;

  if (!title) warnings.push("Missing title in detail HTML.");
  if (!parsedPrice) warnings.push("Missing or unparseable price in detail HTML.");
  if (images.length === 0) warnings.push("No images found in detail HTML.");

  const metadata: Record<string, unknown> = {};
  if (category) metadata.category = category;
  if (warnings.length > 0) metadata.parserWarnings = warnings;

  return {
    externalProductId,
    externalProductUrl,
    title,
    description,
    price: parsedPrice?.amount ?? null,
    currency: parsedPrice?.currency ?? null,
    images,
    status,
    metadata,
  };
}

export function buildProductUrl(productId: string, baseUrl?: string): string {
  const base = baseUrl ?? getZinkGameBaseUrl();
  return toAbsoluteUrl(`/product/${productId}`, base) ?? `${base}/product/${productId}`;
}
