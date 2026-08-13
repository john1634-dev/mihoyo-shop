import "server-only";

import type { SupplierListingResult } from "@/lib/supplier/adapter";
import type { SupplierProduct } from "@/lib/supplier/types";
import {
  buildZinkGameCategoryUrl,
  buildZinkGameListingUrl,
  buildZinkGameProductUrl,
  fetchZinkGameHtml,
  resolveZinkGameUrl,
  ZinkGameFetchError,
} from "@/lib/supplier/zinkgame/client";
import {
  getAllowedCategoryBySlug,
  resolveAllowedCategorySlug,
  allowedCategorySlugs,
  type ZinkGameAllowedCategorySlug,
} from "@/lib/supplier/zinkgame/categories";
import {
  normalizeZinkGameDetail,
} from "@/lib/supplier/zinkgame/normalizer";
import {
  extractProductIdFromUrl,
  parseDetailHtml,
  parseListingHtml,
  ZINKGAME_PRODUCT_ID_PATTERN,
} from "@/lib/supplier/zinkgame/parser";

const SOURCE = "zinkgame";

async function getListingPage(page: number): Promise<SupplierListingResult> {
  if (page > 1) {
    const probeUrl = buildZinkGameListingUrl(1);
    const probe = await fetchZinkGameHtml(probeUrl.toString());
    const probeParsed = parseListingHtml(probe.html, probeUrl.origin);

    if (probeParsed.pagination === "not_detected") {
      return {
        source: SOURCE,
        page,
        listingUrl: buildZinkGameListingUrl(page).toString(),
        items: [],
        pagination: { kind: "not_detected" },
        warnings: [
          "pagination_not_detected",
          "Listing page > 1 requested but no pagination links found in HTML.",
        ],
      };
    }
  }

  const listingUrl = buildZinkGameListingUrl(page);
  const fetched = await fetchZinkGameHtml(listingUrl.toString());
  const parsed = parseListingHtml(fetched.html, listingUrl.origin);

  const pagination =
    parsed.pagination === "query"
      ? { kind: "query" as const, param: "page", page }
      : page === 1
        ? { kind: "none" as const }
        : { kind: "not_detected" as const };

  const warnings = [...parsed.warnings];
  if (pagination.kind === "not_detected" && page > 1) {
    warnings.push("pagination_not_detected");
  }

  if (process.env.NODE_ENV === "development") {
    console.info("[zinkgame:listing]", {
      listingUrl: listingUrl.toString(),
      products: parsed.items.length,
      pagination: pagination.kind,
      warnings,
    });
  }

  return {
    source: SOURCE,
    page,
    listingUrl: listingUrl.toString(),
    items: parsed.items.map((item) => ({
      externalProductId: item.externalProductId,
      externalProductUrl: item.externalProductUrl,
      title: item.title,
      coverImageUrl: item.coverImageUrl,
      price: item.sourcePrice,
      currency: item.sourceCurrency,
    })),
    pagination,
    warnings,
  };
}

export type ZinkGameCategoryListingResult = SupplierListingResult & {
  category: ZinkGameAllowedCategorySlug;
};

async function getCategoryListing(input: {
  category: string;
  page?: number;
}): Promise<ZinkGameCategoryListingResult> {
  const slug = resolveAllowedCategorySlug(input.category);
  if (!slug) {
    throw new ZinkGameFetchError(
      "Category is not allowlisted for ZinkGame auto-import.",
      input.category
    );
  }

  const page = input.page ?? 1;
  const listingUrl = buildZinkGameCategoryUrl(slug, page);
  const categoryMeta = getAllowedCategoryBySlug(slug);

  if (page > 1) {
    const probeUrl = buildZinkGameCategoryUrl(slug, 1);
    const probe = await fetchZinkGameHtml(probeUrl.toString());
    const probeParsed = parseListingHtml(probe.html, probeUrl.origin);
    if (probeParsed.pagination === "not_detected") {
      return {
        source: SOURCE,
        category: slug,
        page,
        listingUrl: listingUrl.toString(),
        items: [],
        pagination: { kind: "not_detected" },
        warnings: [
          "pagination_not_detected",
          "Category page > 1 requested but no pagination links found in HTML.",
        ],
      };
    }
  }

  const fetched = await fetchZinkGameHtml(listingUrl.toString());
  const parsed = parseListingHtml(fetched.html, listingUrl.origin);

  const pagination =
    parsed.pagination === "query"
      ? { kind: "query" as const, param: "page", page }
      : page === 1
        ? { kind: "none" as const }
        : { kind: "not_detected" as const };

  const warnings = [...parsed.warnings];
  if (pagination.kind === "not_detected" && page > 1) {
    warnings.push("pagination_not_detected");
  }

  if (process.env.NODE_ENV === "development") {
    console.info("[zinkgame:category]", {
      category: slug,
      listingUrl: listingUrl.toString(),
      products: parsed.items.length,
      pagination: pagination.kind,
      warnings,
    });
  }

  return {
    source: SOURCE,
    category: slug,
    page,
    listingUrl: listingUrl.toString(),
    items: parsed.items.map((item) => ({
      externalProductId: item.externalProductId,
      externalProductUrl: item.externalProductUrl,
      title: item.title,
      coverImageUrl: item.coverImageUrl,
      price: item.sourcePrice,
      currency: item.sourceCurrency,
      category: categoryMeta?.label ?? slug,
    })),
    pagination,
    warnings,
  };
}

async function getProduct(input: {
  productId?: string;
  url?: string;
}): Promise<SupplierProduct> {
  let productUrl: URL;

  if (input.url?.trim()) {
    productUrl = resolveZinkGameUrl(input.url.trim());
    const idFromUrl = extractProductIdFromUrl(productUrl.toString());
    if (!idFromUrl) {
      throw new ZinkGameFetchError(
        "URL does not contain a valid ZinkGame product id.",
        productUrl.toString()
      );
    }
  } else if (input.productId?.trim()) {
    const id = input.productId.trim().toLowerCase();
    if (!ZINKGAME_PRODUCT_ID_PATTERN.test(id)) {
      throw new ZinkGameFetchError("Invalid ZinkGame product id.", id);
    }
    productUrl = buildZinkGameProductUrl(id);
  } else {
    throw new ZinkGameFetchError(
      "Either productId or url is required.",
      ""
    );
  }

  const fetched = await fetchZinkGameHtml(productUrl.toString());
  const parsed = parseDetailHtml(fetched.html, {
    baseUrl: productUrl.origin,
    productUrl: productUrl.toString(),
    httpStatus: fetched.status,
  });

  if (process.env.NODE_ENV === "development") {
    console.info("[zinkgame:detail]", {
      detailUrl: productUrl.toString(),
      images: parsed.images.length,
      status: parsed.status,
      warnings: parsed.metadata.parserWarnings,
    });
  }

  return normalizeZinkGameDetail(parsed);
}

const MAX_CATEGORY_PAGES = 20;

export async function fetchAllowedCategoryListings(): Promise<{
  items: Array<
    SupplierListingResult["items"][number] & {
      categorySlug: ZinkGameAllowedCategorySlug;
    }
  >;
  errors: Array<{ category: ZinkGameAllowedCategorySlug; message: string }>;
}> {
  const items: Array<
    SupplierListingResult["items"][number] & {
      categorySlug: ZinkGameAllowedCategorySlug;
    }
  > = [];
  const errors: Array<{ category: ZinkGameAllowedCategorySlug; message: string }> =
    [];
  const seen = new Set<string>();

  for (const slug of allowedCategorySlugs()) {
    try {
      for (let page = 1; page <= MAX_CATEGORY_PAGES; page += 1) {
        const listing = await getCategoryListing({ category: slug, page });
        for (const item of listing.items) {
          const id = item.externalProductId.toLowerCase();
          if (seen.has(id)) continue;
          seen.add(id);
          items.push({ ...item, categorySlug: slug });
        }
        if (listing.pagination.kind === "not_detected" && page > 1) break;
        if (listing.pagination.kind !== "query") break;
        if (listing.items.length === 0) break;
      }
    } catch (error) {
      errors.push({
        category: slug,
        message:
          error instanceof Error
            ? error.message
            : "Category listing fetch failed.",
      });
    }
  }

  return { items, errors };
}

export const zinkgameAdapter = {
  source: SOURCE,
  getListingPage,
  getProduct,
  getCategoryListing,
};

export { getCategoryListing };

export { ZinkGameFetchError } from "@/lib/supplier/zinkgame/client";
export {
  buildZinkGameCategoryUrl,
  buildZinkGameListingUrl,
} from "@/lib/supplier/zinkgame/client";
export {
  ZINKGAME_ALLOWED_CATEGORIES,
  ZINKGAME_ALLOWED_CATEGORY_SLUGS,
  categoryLabelMatchesSlug,
  getAllowedCategoryUrl,
  isAllowedCategorySlug,
  resolveAllowedCategorySlug,
} from "@/lib/supplier/zinkgame/categories";
export {
  normalizeZinkGameDetail,
  normalizeZinkGameListingItem,
} from "@/lib/supplier/zinkgame/normalizer";
export {
  parseDetailHtml,
  parseListingHtml,
  parseVndPrice,
  extractProductIdFromUrl,
  toAbsoluteUrl,
} from "@/lib/supplier/zinkgame/parser";
