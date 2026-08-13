/**
 * Phase 8 — ZinkGame adapter parser + preview API tests.
 * Run: node scripts/_phase8-zinkgame-adapter.mjs
 */
import { readFileSync } from "node:fs";

const results = [];

function pass(name) {
  results.push({ name, ok: true });
  console.log(`PASS ${name}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false });
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
}

function read(path) {
  return readFileSync(path, "utf8");
}

// --- Pure helpers (must stay aligned with lib/supplier/zinkgame/parser.ts) ---

function parseVndPrice(raw) {
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

function extractProductIdFromUrl(urlOrPath) {
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

function toAbsoluteUrl(href, baseUrl) {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("javascript:") || trimmed.startsWith("#")) {
    return null;
  }
  try {
    const base = baseUrl ?? "https://zinkgame.com";
    return new URL(trimmed, base.endsWith("/") ? base : `${base}/`).toString();
  } catch {
    return null;
  }
}

function parseListingHtml(html, baseUrl = "https://zinkgame.com") {
  const items = [];
  const seen = new Set();
  const cardRegex =
    /<a\s+href=['"]\/product\/([a-f0-9]{32})['"][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = cardRegex.exec(html)) !== null) {
    const productId = match[1].toLowerCase();
    if (seen.has(productId)) continue;
    seen.add(productId);
    const inner = match[2];
    const imgMatch = inner.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
    const priceBlock = inner.replace(
      /<span[^>]*class=['"][^'"]*hide[^'"]*['"][^>]*>[\s\S]*?<\/span>/gi,
      ""
    );
    const priceMatch = priceBlock.match(/>([^<]*\d[\d.,\s]*(?:đ|VND)[^<]*)</i);
    const parsedPrice = parseVndPrice(priceMatch?.[1] ?? null);
    items.push({
      externalProductId: productId,
      externalProductUrl: toAbsoluteUrl(`/product/${productId}`, baseUrl),
      coverImageUrl: toAbsoluteUrl(imgMatch?.[1] ?? null, baseUrl),
      sourcePrice: parsedPrice?.amount ?? null,
      sourceCurrency: parsedPrice?.currency ?? null,
    });
  }
  return items;
}

function parseDetailHtml(html, baseUrl = "https://zinkgame.com") {
  const productIdMatch = html.match(
    /id=["']productID["'][^>]*value=["']([a-f0-9]{32})["']/i
  );
  const titleMatch = html.match(/id=["']title["'][^>]*>([\s\S]*?)<\/h1>/i);
  const priceMatch = html.match(/id=["']price["'][^>]*>([\s\S]*?)<\/span>/i);
  const avatarMatch = html.match(/<img[^>]*\bid=["']avatar["'][^>]*>/i);
  const avatarSrc = avatarMatch
    ? avatarMatch[0].match(/\bsrc=["']([^"']+)["']/i)?.[1] ?? null
    : null;
  const infoMatch = html.match(/id=["']info["'][^>]*>([\s\S]*?)<\/div>/i);
  const parsedPrice = parseVndPrice(priceMatch?.[1] ?? null);
  const images = [];
  const cover = toAbsoluteUrl(avatarSrc, baseUrl);
  if (cover) images.push({ url: cover, sortOrder: 0 });
  if (infoMatch?.[1]) {
    const imgRegex = /<img[^>]+src=['"]([^'"]+)['"][^>]*>/gi;
    let img;
    while ((img = imgRegex.exec(infoMatch[1])) !== null) {
      const url = toAbsoluteUrl(img[1], baseUrl);
      if (url) images.push({ url, sortOrder: images.length });
    }
  }
  return {
    externalProductId: productIdMatch?.[1]?.toLowerCase() ?? null,
    title: titleMatch?.[1]?.replace(/<[^>]+>/g, "").trim() ?? null,
    price: parsedPrice?.amount ?? null,
    currency: parsedPrice?.currency ?? null,
    description: infoMatch?.[1]?.trim() ?? null,
    images,
  };
}

// --- Price parser tests ---

const price1 = parseVndPrice("3,500,000đ");
if (price1?.amount === 3500000 && price1.currency === "VND") {
  pass("price_comma_thousands");
} else {
  fail("price_comma_thousands", JSON.stringify(price1));
}

const price2 = parseVndPrice("3.500.000đ");
if (price2?.amount === 3500000) {
  pass("price_dot_thousands");
} else {
  fail("price_dot_thousands", JSON.stringify(price2));
}

const price3 = parseVndPrice("3500000đ");
if (price3?.amount === 3500000) {
  pass("price_plain_digits");
} else {
  fail("price_plain_digits", JSON.stringify(price3));
}

const price4 = parseVndPrice("3 500 000đ");
if (price4?.amount === 3500000) {
  pass("price_space_thousands");
} else {
  fail("price_space_thousands", JSON.stringify(price4));
}

const priceHidden = parseVndPrice("3,500,000đ000đ");
if (priceHidden?.amount === 3500000) {
  pass("price_ignores_trailing_noise");
} else {
  fail("price_ignores_trailing_noise", JSON.stringify(priceHidden));
}

if (parseVndPrice("") === null && parseVndPrice("free") === null) {
  pass("price_missing_returns_null");
} else {
  fail("price_missing_returns_null");
}

// --- Product ID extraction ---

const id = extractProductIdFromUrl(
  "/product/013b7433562445e1aa23a49a26c56675"
);
if (id === "013b7433562445e1aa23a49a26c56675") {
  pass("product_id_from_path");
} else {
  fail("product_id_from_path", id);
}

const idAbs = extractProductIdFromUrl(
  "https://zinkgame.com/product/013b7433562445e1aa23a49a26c56675"
);
if (idAbs === "013b7433562445e1aa23a49a26c56675") {
  pass("product_id_from_absolute_url");
} else {
  fail("product_id_from_absolute_url", idAbs);
}

// --- Absolute URL ---

const abs = toAbsoluteUrl("/images/test.jpg", "https://zinkgame.com");
if (abs === "https://zinkgame.com/images/test.jpg") {
  pass("relative_image_to_absolute");
} else {
  fail("relative_image_to_absolute", abs);
}

// --- Missing fields resilience ---

const minimalHtml = `<html><body><h1 id="title">Test</h1></body></html>`;
const minimal = parseDetailHtml(minimalHtml);
if (
  minimal.title === "Test" &&
  minimal.price === null &&
  minimal.description === null &&
  minimal.images.length === 0
) {
  pass("missing_fields_no_crash");
} else {
  fail("missing_fields_no_crash", JSON.stringify(minimal));
}

// --- Fixture-based listing/detail ---

let homeHtml;
let productHtml;
try {
  homeHtml = read("scripts/_fixtures_zink_home.html");
  productHtml = read("scripts/_fixtures_zink_product.html");
} catch (error) {
  fail("fixtures_available", error.message);
  homeHtml = "";
  productHtml = "";
}

if (homeHtml) {
  const listing = parseListingHtml(homeHtml);
  if (listing.length >= 1) {
    pass("listing_fixture_parses_products");
  } else {
    fail("listing_fixture_parses_products");
  }

  const first = listing.find(
    (item) => item.externalProductId === "013b7433562445e1aa23a49a26c56675"
  );
  if (first?.sourcePrice === 3500000 && first.sourceCurrency === "VND") {
    pass("listing_fixture_price");
  } else {
    fail("listing_fixture_price", JSON.stringify(first));
  }

  if (
    first?.coverImageUrl?.includes("/images/a20e8b5b135247e2baec6fcd6b2a15ef.jpg")
  ) {
    pass("listing_fixture_cover_url");
  } else {
    fail("listing_fixture_cover_url", first?.coverImageUrl);
  }
}

if (productHtml) {
  const detail = parseDetailHtml(productHtml);
  if (detail.externalProductId === "013b7433562445e1aa23a49a26c56675") {
    pass("detail_fixture_product_id");
  } else {
    fail("detail_fixture_product_id", detail.externalProductId);
  }

  if (detail.price === 3500000 && detail.currency === "VND") {
    pass("detail_fixture_price");
  } else {
    fail("detail_fixture_price", JSON.stringify(detail));
  }

  if (detail.title && detail.title.includes("H4702")) {
    pass("detail_fixture_full_title");
  } else {
    fail("detail_fixture_full_title", detail.title);
  }

  if (detail.images.length >= 2) {
    pass("detail_fixture_images");
  } else {
    fail("detail_fixture_images", String(detail.images.length));
  }

  const gallery = detail.images.find((img) =>
    img.url.includes("18ed8eb9aedd43eeb8f4491b5d13a430.jpg")
  );
  if (gallery) {
    pass("detail_fixture_gallery_absolute_url");
  } else {
    fail("detail_fixture_gallery_absolute_url");
  }
}

// --- Source file structure + safety ---

const previewApi = read("app/api/admin/suppliers/zinkgame/preview/route.ts");
const client = read("lib/supplier/zinkgame/client.ts");
const parser = read("lib/supplier/zinkgame/parser.ts");
const config = read("lib/supplier/config.ts");

if (previewApi.includes("requireAdmin")) pass("preview_requires_admin");
else fail("preview_requires_admin");

if (previewApi.includes("isAllowedZinkGameUrl")) pass("preview_ssrf_host_check");
else fail("preview_ssrf_host_check");

if (
  !previewApi.includes('.from("products")') &&
  !previewApi.includes(".from('products')")
) {
  pass("preview_no_product_db_writes");
} else {
  fail("preview_no_product_db_writes");
}

if (config.includes("ZINKGAME_BASE_URL")) pass("config_env_base_url");
else fail("config_env_base_url");

if (client.includes("MAX_RESPONSE_BYTES")) pass("client_response_size_limit");
else fail("client_response_size_limit");

if (parser.includes("parseVndPrice")) pass("parser_price_export");
else fail("parser_price_export");

const requiredFiles = [
  "lib/supplier/adapter.ts",
  "lib/supplier/registry.ts",
  "lib/supplier/zinkgame/index.ts",
  "lib/supplier/zinkgame/normalizer.ts",
];

for (const file of requiredFiles) {
  try {
    read(file);
    pass(`file_exists_${file.replace(/[/\\]/g, "_")}`);
  } catch {
    fail(`file_exists_${file.replace(/[/\\]/g, "_")}`);
  }
}

// --- Optional live fetch ---

let livePreview = null;
try {
  const response = await fetch(
    "https://zinkgame.com/product/013b7433562445e1aa23a49a26c56675",
    {
      headers: {
        Accept: "text/html",
        "User-Agent": "BaituGames-SupplierBot/1.0 (phase8-test)",
      },
      signal: AbortSignal.timeout(15000),
    }
  );
  if (response.ok) {
    const html = await response.text();
    const live = parseDetailHtml(html);
    if (live.externalProductId && live.title) {
      livePreview = {
        source: "zinkgame",
        externalProductId: live.externalProductId,
        title: live.title,
        price: live.price ?? 0,
        currency: live.currency ?? "VND",
        status: "active",
        images: live.images.map((img) => ({ url: img.url, sortOrder: img.sortOrder })),
      };
      pass("live_fetch_available");
    } else {
      fail("live_fetch_parse");
    }
  } else {
    fail("live_fetch_status", String(response.status));
  }
} catch (error) {
  fail("live_fetch_available", error.message);
}

const failed = results.filter((r) => !r.ok);
console.log(`\nPhase 8 tests: ${results.length - failed.length}/${results.length} passed`);

if (livePreview) {
  console.log("\nExample live preview JSON:");
  console.log(JSON.stringify(livePreview, null, 2));
} else {
  console.log("\nLive fetch unavailable — fixture tests only.");
}

process.exit(failed.length > 0 ? 1 : 0);
