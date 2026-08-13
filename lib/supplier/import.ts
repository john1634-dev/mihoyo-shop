import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/errors";
import { getVndToMyrRate } from "@/lib/exchange-rate";
import { buildSupplierDescription } from "@/lib/supplier/description";
import {
  extractSupplierCategory,
  loadActiveGames,
  resolveGameIdFromSupplierCategory,
} from "@/lib/supplier/game-mapping";
import { categoryLabelMatchesSlug } from "@/lib/supplier/zinkgame/categories";
import { buildSupplierProductPreview } from "@/lib/supplier/preview";
import {
  calculateSupplierSellingPrice,
  getDefaultMarkupPercent,
} from "@/lib/supplier/pricing";
import { resolveUniqueProductSlug } from "@/lib/supplier/slug";
import {
  isSupplierCatalogActive,
  normalizeSupplierSourceStatus,
} from "@/lib/supplier/status";
import { supplierProductToDbFields } from "@/lib/supplier/sync";
import type { SupplierProduct } from "@/lib/supplier/types";
import { zinkgameAdapter } from "@/lib/supplier/zinkgame";

export type ImportStatusInfo = {
  canImport: boolean;
  reason:
    | "ready"
    | "already_imported"
    | "invalid_supplier_status"
    | "invalid_source"
    | "pricing_unavailable"
    | null;
  existingProductId?: string | null;
  message?: string | null;
};

export type SupplierImportSuccess = {
  imported: true;
  productId: string;
  title: string;
  slug: string;
  sellingPriceMyr: number;
  costMyr: number;
  markupPercent: number;
  imageImportStatus: "pending";
  translationFailed?: boolean;
};

export type SupplierImportFailure = {
  imported: false;
  reason:
    | "already_imported"
    | "game_mapping_required"
    | "invalid_supplier_status"
    | "invalid_source"
    | "pricing_error"
    | "supplier_fetch_failed"
    | "invalid_category"
    | "import_failed";
  productId?: string;
  message?: string;
};

export type SupplierImportResult = SupplierImportSuccess | SupplierImportFailure;

export type ImportSupplierProductInput = {
  source: string;
  productId?: string;
  url?: string;
  markupPercent?: number;
  gameId?: string;
  exchangeRate?: number;
  translationProvider?: string;
  expectedCategorySlug?: string;
};

const ALLOWED_SOURCES = new Set(["zinkgame"]);

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return error.code === "23505" || /duplicate key/i.test(error.message ?? "");
}

export async function findExistingImportedProduct(
  client: SupabaseClient,
  source: string,
  externalProductId: string
): Promise<{ id: string } | null> {
  const { data, error } = await client
    .from("products")
    .select("id")
    .eq("source", source)
    .eq("source_product_id", externalProductId)
    .maybeSingle();

  if (error) throw error;
  return data ? { id: data.id as string } : null;
}

export async function getImportStatus(
  client: SupabaseClient,
  product: SupplierProduct,
  previewPricingAvailable: boolean
): Promise<ImportStatusInfo> {
  if (!ALLOWED_SOURCES.has(product.source.trim().toLowerCase())) {
    return {
      canImport: false,
      reason: "invalid_source",
      message: "Unsupported supplier source.",
    };
  }

  const existing = await findExistingImportedProduct(
    client,
    product.source,
    product.externalProductId
  );

  if (existing) {
    return {
      canImport: false,
      reason: "already_imported",
      existingProductId: existing.id,
      message: "This supplier product has already been imported.",
    };
  }

  if (!isSupplierCatalogActive(product.status)) {
    return {
      canImport: false,
      reason: "invalid_supplier_status",
      message: `Supplier status is "${normalizeSupplierSourceStatus(product.status)}" — only active listings can be imported.`,
    };
  }

  if (!previewPricingAvailable) {
    return {
      canImport: false,
      reason: "pricing_unavailable",
      message: "Pricing could not be calculated for this listing.",
    };
  }

  return {
    canImport: true,
    reason: "ready",
    message: null,
  };
}

async function fetchSupplierProductForImport(
  input: ImportSupplierProductInput
): Promise<SupplierProduct> {
  const source = input.source.trim().toLowerCase();
  if (source !== "zinkgame") {
    throw new Error("Unsupported supplier source.");
  }

  return zinkgameAdapter.getProduct(
    input.url?.trim()
      ? { url: input.url.trim() }
      : { productId: input.productId?.trim() ?? "" }
  );
}

/**
 * Safe supplier import — always re-fetches supplier detail server-side.
 * Does not create product_images (image import pending logo processing).
 */
export async function importSupplierProduct(
  client: SupabaseClient,
  input: ImportSupplierProductInput
): Promise<SupplierImportResult> {
  const source = input.source.trim().toLowerCase();

  if (!ALLOWED_SOURCES.has(source)) {
    return {
      imported: false,
      reason: "invalid_source",
      message: "Unsupported supplier source.",
    };
  }

  let supplierProduct: SupplierProduct;
  try {
    supplierProduct = await fetchSupplierProductForImport(input);
  } catch (error) {
    logServerError("supplier import fetch", error);
    return {
      imported: false,
      reason: "supplier_fetch_failed",
      message:
        error instanceof Error
          ? error.message
          : "Failed to fetch supplier product.",
    };
  }

  if (supplierProduct.source.trim().toLowerCase() !== source) {
    return {
      imported: false,
      reason: "invalid_source",
      message: "Supplier source mismatch after revalidation.",
    };
  }

  const existing = await findExistingImportedProduct(
    client,
    source,
    supplierProduct.externalProductId
  );

  if (existing) {
    return {
      imported: false,
      reason: "already_imported",
      productId: existing.id,
      message: "This supplier product has already been imported.",
    };
  }

  const expectedCategorySlug = input.expectedCategorySlug?.trim().toLowerCase();
  if (expectedCategorySlug) {
    const liveCategory = extractSupplierCategory(supplierProduct.metadata);
    if (!categoryLabelMatchesSlug(liveCategory, expectedCategorySlug)) {
      return {
        imported: false,
        reason: "invalid_category",
        message: liveCategory
          ? `Supplier category "${liveCategory}" is not allowlisted.`
          : "Supplier category could not be determined.",
      };
    }
  }

  if (!isSupplierCatalogActive(supplierProduct.status)) {
    return {
      imported: false,
      reason: "invalid_supplier_status",
      message: `Supplier listing is "${normalizeSupplierSourceStatus(supplierProduct.status)}" — import skipped.`,
    };
  }

  const markupPercent =
    input.markupPercent ?? getDefaultMarkupPercent(source);

  if (!Number.isFinite(markupPercent) || markupPercent < 0) {
    return {
      imported: false,
      reason: "pricing_error",
      message: "Invalid markup percent.",
    };
  }

  let preview;
  try {
    preview = await buildSupplierProductPreview(supplierProduct, {
      markupPercent,
      translationProvider: input.translationProvider,
      exchangeRate: input.exchangeRate,
    });
  } catch (error) {
    logServerError("supplier import preview", error);
    return {
      imported: false,
      reason: "pricing_error",
      message: "Unable to build import preview.",
    };
  }

  if (
    preview.costMyr == null ||
    preview.sellingPriceMyr == null ||
    preview.pricingError
  ) {
    return {
      imported: false,
      reason: "pricing_error",
      message: preview.pricingError ?? "Pricing unavailable.",
    };
  }

  let rateResult: { rate: number };
  if (
    input.exchangeRate != null &&
    Number.isFinite(input.exchangeRate) &&
    input.exchangeRate > 0
  ) {
    rateResult = { rate: input.exchangeRate };
  } else {
    try {
      rateResult = await getVndToMyrRate();
    } catch (error) {
      logServerError("supplier import exchange rate", error);
      return {
        imported: false,
        reason: "pricing_error",
        message: "Unable to fetch exchange rate.",
      };
    }
  }

  if (!Number.isFinite(rateResult.rate) || rateResult.rate <= 0) {
    return {
      imported: false,
      reason: "pricing_error",
      message: "Unable to fetch exchange rate.",
    };
  }

  const pricing = calculateSupplierSellingPrice({
    supplierPrice: supplierProduct.price,
    supplierCurrency: "VND",
    markupPercent,
    exchangeRate: rateResult.rate,
  });

  const games = await loadActiveGames(client);
  const category = extractSupplierCategory(supplierProduct.metadata);
  let gameId = input.gameId?.trim() || null;

  if (gameId) {
    const exists = games.some((game) => game.id === gameId);
    if (!exists) {
      return {
        imported: false,
        reason: "game_mapping_required",
        message: "Selected game does not exist.",
      };
    }
  } else {
    gameId = resolveGameIdFromSupplierCategory(category, games);
  }

  if (!gameId) {
    return {
      imported: false,
      reason: "game_mapping_required",
      message: category
        ? `No game mapping for supplier category "${category}".`
        : "Game mapping required — supplier category not detected.",
    };
  }

  const translatedTitle = preview.translatedTitle.trim();
  if (!translatedTitle) {
    return {
      imported: false,
      reason: "import_failed",
      message: "Translated title is empty.",
    };
  }

  if (preview.translationFailed) {
    logServerError("supplier import translation", {
      message: preview.translation.error ?? "Translation failed.",
    });
  }

  let slug: string;
  try {
    slug = await resolveUniqueProductSlug(client, translatedTitle);
  } catch (error) {
    logServerError("supplier import slug", error);
    return {
      imported: false,
      reason: "import_failed",
      message: "Unable to generate product slug.",
    };
  }

  const nowIso = new Date().toISOString();
  const supplierFields = supplierProductToDbFields(supplierProduct, {
    checkedAt: nowIso,
    syncedAt: nowIso,
    syncError: null,
  });

  const insertPayload = {
    title: translatedTitle,
    slug,
    description: buildSupplierDescription(
      preview.originalTitle,
      supplierProduct.description
    ),
    price: pricing.sellingPriceMyr,
    currency: "MYR",
    status: "available",
    game_id: gameId,
    server: null,
    region_code: null,
    ar_level: null,
    cover_image_url: null,
    supplier_name: "ZinkGame",
    shopee_url: null,
    cost_vnd: supplierProduct.price,
    cost_myr: pricing.costMyr,
    vnd_myr_rate: rateResult.rate,
    cost_currency: "VND",
    cost_rate_updated_at: nowIso,
    source: supplierFields.source,
    source_product_id: supplierFields.source_product_id,
    source_product_url: supplierFields.source_product_url,
    source_status: supplierFields.source_status,
    source_price: supplierFields.source_price,
    source_currency: supplierFields.source_currency,
    last_synced_at: supplierFields.last_synced_at,
    last_source_check_at: supplierFields.last_source_check_at,
    sync_error: null,
  };

  const { data, error } = await client
    .from("products")
    .insert(insertPayload)
    .select("id,title,slug,price")
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      const raced = await findExistingImportedProduct(
        client,
        source,
        supplierProduct.externalProductId
      );
      return {
        imported: false,
        reason: "already_imported",
        productId: raced?.id,
        message: "This supplier product has already been imported.",
      };
    }

    logServerError("supplier import insert", error);
    return {
      imported: false,
      reason: "import_failed",
      message: "Product import failed.",
    };
  }

  return {
    imported: true,
    productId: data.id as string,
    title: data.title as string,
    slug: data.slug as string,
    sellingPriceMyr: Number(data.price),
    costMyr: pricing.costMyr,
    markupPercent,
    imageImportStatus: "pending",
    translationFailed: preview.translationFailed,
  };
}
