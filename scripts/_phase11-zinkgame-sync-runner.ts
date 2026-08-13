/**
 * Phase 11 test runner.
 */
import { readFile } from "node:fs/promises";
import { computeCostMyr } from "../lib/costing";
import { calculateSupplierSellingPrice } from "../lib/supplier/pricing";
import {
  computeSupplierSyncDiff,
  determineSyncStatus,
  getStorefrontSyncRecommendation,
  summarizeSyncDiffs,
  type SyncableProductRow,
} from "../lib/supplier/sync-diff";
import type { SupplierPreviewResult } from "../lib/supplier/preview";

const results: { name: string; ok: boolean }[] = [];

function pass(name: string) {
  results.push({ name, ok: true });
  console.log(`PASS ${name}`);
}

function fail(name: string, detail = "") {
  results.push({ name, ok: false });
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
}

function makeExisting(overrides: Partial<SyncableProductRow> = {}): SyncableProductRow {
  return {
    id: "prod-1",
    title: "H4702 CN Server Neu C6",
    description: "Original supplier title: Vietnamese title",
    price: 1260,
    currency: "MYR",
    status: "available",
    supplier_name: "ZinkGame",
    cost_vnd: 3_500_000,
    cost_myr: 630,
    vnd_myr_rate: 0.00018,
    cost_currency: "VND",
    source: "zinkgame",
    source_product_id: "abc123def456789012345678901234ab",
    source_product_url: "https://zinkgame.com/product/abc123def456789012345678901234ab",
    source_status: "active",
    source_price: 3_500_000,
    source_currency: "VND",
    last_synced_at: null,
    last_source_check_at: null,
    sync_error: null,
    ...overrides,
  };
}

function makeLive(overrides: Partial<SupplierPreviewResult> = {}): SupplierPreviewResult {
  return {
    source: "zinkgame",
    originalTitle: "Vietnamese title",
    translatedTitle: "H4702 CN Server Neu C6",
    translationFailed: false,
    translation: {
      status: "completed",
      sourceLanguage: "vi",
      targetLanguage: "en",
      sourceText: "Vietnamese title",
      translatedText: "H4702 CN Server Neu C6",
      provider: "rules",
    },
    sourcePrice: 3_500_000,
    sourceCurrency: "VND",
    costMyr: 630,
    markupPercent: 100,
    sellingPriceMyr: 1260,
    profitMyr: 630,
    exchangeRate: 0.00018,
    exchangeRateUpdatedAt: null,
    exchangeRateSource: "test",
    pricingError: null,
    product: {
      source: "zinkgame",
      externalProductId: "abc123def456789012345678901234ab",
      externalProductUrl:
        "https://zinkgame.com/product/abc123def456789012345678901234ab",
      title: "Vietnamese title",
      description: null,
      price: 3_500_000,
      currency: "VND",
      status: "active",
      images: [{ url: "https://zinkgame.com/a.jpg", sortOrder: 0 }],
    },
    images: [{ url: "https://zinkgame.com/a.jpg", sortOrder: 0 }],
    ...overrides,
  };
}

async function main() {
  const syncPreviewRoute = await readFile(
    "app/api/admin/suppliers/zinkgame/sync/preview/route.ts",
    "utf8"
  );
  const syncListingRoute = await readFile(
    "app/api/admin/suppliers/zinkgame/sync/listing/route.ts",
    "utf8"
  );
  const syncRoute = await readFile(
    "app/api/admin/suppliers/zinkgame/sync/route.ts",
    "utf8"
  );
  const syncRun = await readFile("lib/supplier/sync-run.ts", "utf8");
  const syncDiff = await readFile("lib/supplier/sync-diff.ts", "utf8");
  const adminPage = await readFile("app/admin/suppliers/zinkgame/page.tsx", "utf8");

  if (syncPreviewRoute.includes("requireAdmin")) pass("sync_preview_requires_admin");
  else fail("sync_preview_requires_admin");

  if (syncListingRoute.includes("requireAdmin")) pass("sync_listing_requires_admin");
  else fail("sync_listing_requires_admin");

  if (syncRoute.includes("requireAdmin")) pass("sync_apply_requires_admin");
  else fail("sync_apply_requires_admin");

  if (syncPreviewRoute.includes("isAllowedZinkGameUrl")) pass("sync_preview_ssrf");
  else fail("sync_preview_ssrf");

  if (!syncPreviewRoute.includes('.from("products").update')) {
    pass("sync_preview_no_db_write");
  } else {
    fail("sync_preview_no_db_write");
  }

  if (!syncListingRoute.includes('.from("products").update')) {
    pass("sync_listing_no_db_write");
  } else {
    fail("sync_listing_no_db_write");
  }

  if (syncRun.includes('eq("source", SOURCE)')) pass("matching_by_source_and_external_id");
  else fail("matching_by_source_and_external_id");

  if (syncRun.includes("fetchLivePreview")) pass("server_refetch_before_sync");
  else fail("server_refetch_before_sync");

  if (
    syncRoute.includes("confirm: true") &&
    !syncRoute.includes("body.title") &&
    syncRun.includes("fetchLivePreview")
  ) {
    pass("browser_price_cannot_be_trusted");
    pass("browser_title_cannot_be_trusted");
  } else {
    fail("browser_price_cannot_be_trusted");
    fail("browser_title_cannot_be_trusted");
  }

  if (
    !syncRun.match(/updatePayload[\s\S]*?\n\s+status:/) &&
    !syncRun.includes("products.status")
  ) {
    pass("no_storefront_status_auto_change");
  } else {
    fail("no_storefront_status_auto_change");
  }

  if (
    !syncRun.includes('.from("product_images").insert') &&
    !syncRun.includes('.from("product_images").update') &&
    !syncRun.includes('.from("product_images").delete') &&
    syncDiff.includes("images?: {")
  ) {
    pass("no_image_update");
  } else {
    fail("no_image_update");
  }

  if (
    !syncRun.includes("inventory") &&
    !syncRun.includes("stripe") &&
    !syncRun.includes("shopee_url")
  ) {
    pass("no_inventory_update");
    pass("no_stripe_change");
  } else {
    fail("no_inventory_update");
    fail("no_stripe_change");
  }

  if (syncRun.includes("last_source_check_at") && syncRun.includes("sync_error")) {
    pass("sync_error_handling");
  } else {
    fail("sync_error_handling");
  }

  if (adminPage.includes("Sync Check")) pass("admin_sync_check_ui");
  else fail("admin_sync_check_ui");

  if (adminPage.includes("confirm: true")) pass("admin_confirm_sync_only");
  else fail("admin_confirm_sync_only");

  // Unit: matching / detection
  const newDiff = computeSupplierSyncDiff(null, makeLive());
  if (newDiff.syncStatus === "new" && !newDiff.canSync) pass("new_product_detection");
  else fail("new_product_detection");

  const unchanged = computeSupplierSyncDiff(makeExisting(), makeLive(), {
    existingImageCount: 1,
  });
  if (unchanged.syncStatus === "unchanged") pass("unchanged_detection");
  else fail("unchanged_detection", unchanged.syncStatus);

  const priceChanged = computeSupplierSyncDiff(
    makeExisting(),
    makeLive({
      sourcePrice: 4_000_000,
      costMyr: 720,
      sellingPriceMyr: 1440,
      profitMyr: 720,
      product: {
        ...makeLive().product,
        price: 4_000_000,
      },
    }),
    { existingImageCount: 1 }
  );
  if (priceChanged.syncStatus === "price_changed") pass("price_change_detection");
  else fail("price_change_detection", priceChanged.syncStatus);

  const titleChanged = computeSupplierSyncDiff(
    makeExisting(),
    makeLive({
      translatedTitle: "H4702 CN Server Neu C6 and Friends",
      translation: {
        status: "completed",
        sourceLanguage: "vi",
        targetLanguage: "en",
        sourceText: "Vietnamese title",
        translatedText: "H4702 CN Server Neu C6 and Friends",
        provider: "rules",
      },
    }),
    { existingImageCount: 1 }
  );
  if (titleChanged.syncStatus === "title_changed") pass("title_change_detection");
  else fail("title_change_detection", titleChanged.syncStatus);

  const statusChanged = computeSupplierSyncDiff(
    makeExisting(),
    makeLive({
      product: { ...makeLive().product, status: "sold" },
    }),
    { existingImageCount: 1 }
  );
  if (statusChanged.syncStatus === "status_changed") pass("status_change_detection");
  else fail("status_change_detection", statusChanged.syncStatus);

  const delisted = computeSupplierSyncDiff(
    makeExisting(),
    makeLive({
      product: { ...makeLive().product, status: "delisted" },
    }),
    { existingImageCount: 1 }
  );
  if (delisted.syncStatus === "delisted") pass("delisted_detection");
  else fail("delisted_detection", delisted.syncStatus);

  const multiple = computeSupplierSyncDiff(
    makeExisting(),
    makeLive({
      translatedTitle: "New Title",
      sourcePrice: 4_000_000,
      costMyr: 720,
      sellingPriceMyr: 1440,
      profitMyr: 720,
      product: {
        ...makeLive().product,
        price: 4_000_000,
        status: "sold",
      },
    }),
    { existingImageCount: 1 }
  );
  if (multiple.syncStatus === "multiple_changes") pass("multiple_changes_detection");
  else fail("multiple_changes_detection", multiple.syncStatus);

  const imageChange = computeSupplierSyncDiff(makeExisting(), makeLive(), {
    existingImageCount: 2,
  });
  if (imageChange.changes.images?.changed) pass("image_change_detection");
  else fail("image_change_detection");

  const storefront = getStorefrontSyncRecommendation("available", "sold");
  if (storefront.recommendation === "sold") pass("storefront_recommendation_only");
  else fail("storefront_recommendation_only");

  const summary = summarizeSyncDiffs([
    newDiff,
    unchanged,
    priceChanged,
    titleChanged,
    statusChanged,
    delisted,
    multiple,
  ]);
  if (summary.new === 1 && summary.unchanged === 1 && summary.price_changed === 1) {
    pass("sync_summary_counts");
  } else {
    fail("sync_summary_counts");
  }

  const rate = 0.00018;
  const vnd = 4_000_000;
  const cost = computeCostMyr(vnd, rate);
  const pricing = calculateSupplierSellingPrice({
    supplierPrice: vnd,
    supplierCurrency: "VND",
    markupPercent: 100,
    exchangeRate: rate,
  });
  if (Math.abs(cost - 720) < 0.01 && pricing.sellingPriceMyr === 1440) {
    pass("vnd_to_myr_conversion");
    pass("default_100_percent_markup");
  } else {
    fail("vnd_to_myr_conversion");
    fail("default_100_percent_markup");
  }

  const statusOnly = determineSyncStatus(
    { sourceStatus: { old: "active", new: "sold" } },
    "active",
    "sold"
  );
  if (statusOnly === "status_changed") pass("determine_sync_status");
  else fail("determine_sync_status");

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nPhase 11: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
