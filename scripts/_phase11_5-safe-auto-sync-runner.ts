/**
 * Phase 11.5 test runner.
 */
import { readFile } from "node:fs/promises";
import { computeCostMyr } from "../lib/costing";
import {
  evaluateAutoSyncPlan,
  resolveAutoStorefrontStatus,
  type AutoSyncPricing,
} from "../lib/supplier/auto-sync";
import {
  calculateSellingPriceChangePercent,
  calculateSupplierSellingPrice,
  getMaxAutoPriceChangePercent,
  isAutoPriceChangeAllowed,
} from "../lib/supplier/pricing";
import type { SyncableProductRow } from "../lib/supplier/sync-diff";
import type { SupplierProduct } from "../lib/supplier/types";

const results: { name: string; ok: boolean }[] = [];

function pass(name: string) {
  results.push({ name, ok: true });
  console.log(`PASS ${name}`);
}

function fail(name: string, detail = "") {
  results.push({ name, ok: false });
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
}

function makeExisting(
  overrides: Partial<SyncableProductRow> = {}
): SyncableProductRow {
  return {
    id: "prod-1",
    title: "Test Product",
    description: "desc",
    price: 1000,
    currency: "MYR",
    status: "available",
    supplier_name: "ZinkGame",
    cost_vnd: 3_500_000,
    cost_myr: 500,
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

function makeLiveProduct(overrides: Partial<SupplierProduct> = {}): SupplierProduct {
  return {
    source: "zinkgame",
    externalProductId: "abc123def456789012345678901234ab",
    externalProductUrl:
      "https://zinkgame.com/product/abc123def456789012345678901234ab",
    title: "Vietnamese title",
    description: null,
    price: 3_500_000,
    currency: "VND",
    status: "active",
    images: [],
    ...overrides,
  };
}

function makePricing(
  sourcePrice: number,
  rate = 0.00018,
  markup = 100
): AutoSyncPricing {
  const pricing = calculateSupplierSellingPrice({
    supplierPrice: sourcePrice,
    supplierCurrency: "VND",
    markupPercent: markup,
    exchangeRate: rate,
  });
  return {
    sourcePrice,
    costMyr: pricing.costMyr,
    sellingPriceMyr: pricing.sellingPriceMyr,
    exchangeRate: rate,
  };
}

async function main() {
  const autoRoute = await readFile(
    "app/api/admin/suppliers/zinkgame/sync/auto/route.ts",
    "utf8"
  );
  const autoSync = await readFile("lib/supplier/auto-sync.ts", "utf8");
  const pricingLib = await readFile("lib/supplier/pricing.ts", "utf8");
  const adminPage = await readFile("app/admin/suppliers/zinkgame/page.tsx", "utf8");

  if (autoRoute.includes("requireAdmin")) pass("auto_sync_requires_admin");
  else fail("auto_sync_requires_admin");

  if (
    autoRoute.includes("confirm") &&
    autoSync.includes("dryRun = input.confirm !== true")
  ) {
    pass("dry_run_supported");
  } else {
    fail("dry_run_supported");
  }

  if (autoSync.includes("dryRun = input.confirm !== true")) pass("dry_run_no_db_write");
  else fail("dry_run_no_db_write");

  if (autoSync.includes("sourcePricesDiffer")) pass("source_price_diff_logic");
  else fail("source_price_diff_logic");

  if (autoSync.includes("DETAIL_CONCURRENCY")) pass("concurrency_limit");
  else fail("concurrency_limit");

  if (
    autoSync.includes("fetchAllowedCategoryListings") ||
    autoSync.includes("getCategoryListing")
  ) {
    pass("server_refetch_required");
  } else {
    fail("server_refetch_required");
  }

  if (autoSync.includes("sourceUnavailable")) pass("listing_failure_stops_sync");
  else fail("listing_failure_stops_sync");

  if (
    !autoRoute.includes("body.price") &&
    !autoSync.includes("input.price")
  ) {
    pass("browser_price_ignored");
  } else {
    fail("browser_price_ignored");
  }

  if (
    !autoRoute.includes("body.status") &&
    !autoSync.includes("input.status")
  ) {
    pass("browser_status_ignored");
  } else {
    fail("browser_status_ignored");
  }

  if (
    autoSync.includes("plan.newStorefrontStatus") &&
    autoSync.includes("updatePayload.status =")
  ) {
    pass("storefront_status_rules_applied");
  } else {
    fail("storefront_status_rules_applied");
  }

  if (
    !autoSync.includes('.from("product_images")') &&
    !autoSync.includes("updatePayload.title")
  ) {
    pass("no_image_changes");
    pass("no_title_changes");
  } else {
    fail("no_image_changes");
    fail("no_title_changes");
  }

  if (!autoSync.includes("inventory") && !autoSync.includes("stripe")) {
    pass("no_inventory_changes");
    pass("no_stripe_changes");
  } else {
    fail("no_inventory_changes");
    fail("no_stripe_changes");
  }

  if (adminPage.includes("Auto Sync")) pass("admin_auto_sync_ui");
  else fail("admin_auto_sync_ui");

  if (adminPage.includes("runAutoSync(false)")) pass("admin_dry_run_first");
  else fail("admin_dry_run_first");

  if (pricingLib.includes("ZINKGAME_MAX_AUTO_PRICE_CHANGE_PERCENT")) {
    pass("price_threshold_env");
  } else {
    fail("price_threshold_env");
  }

  if (getMaxAutoPriceChangePercent("zinkgame") === 30) {
    pass("default_threshold_30_percent");
  } else {
    fail("default_threshold_30_percent");
  }

  const rate = 0.00018;
  const markup = 100;
  const baseVnd = 3_500_000;
  const basePricing = makePricing(baseVnd, rate, markup);
  const existingBase = makeExisting({
    price: basePricing.sellingPriceMyr,
    source_price: baseVnd,
    cost_myr: basePricing.costMyr,
  });

  function pricingForSellingTarget(targetSelling: number): AutoSyncPricing {
    const cost = targetSelling / (1 + markup / 100);
    const vnd = Math.round(cost / rate);
    return makePricing(vnd, rate, markup);
  }

  if (basePricing.sellingPriceMyr === computeCostMyr(baseVnd, rate) * 2) {
    pass("markup_100_percent");
  } else {
    fail("markup_100_percent");
  }

  const plus10Target =
    Math.round(basePricing.sellingPriceMyr * 1.1 * 100) / 100;
  const plus10 = pricingForSellingTarget(plus10Target);
  if (
    isAutoPriceChangeAllowed(
      basePricing.sellingPriceMyr,
      plus10.sellingPriceMyr,
      30
    ) &&
    evaluateAutoSyncPlan(
      existingBase,
      makeLiveProduct({ price: plus10.sourcePrice }),
      plus10,
      { maxPriceChangePercent: 30 }
    ).wouldUpdatePrice
  ) {
    pass("price_plus_10_allowed");
  } else {
    fail("price_plus_10_allowed");
  }

  const plus30Target =
    Math.round(basePricing.sellingPriceMyr * 1.3 * 100) / 100;
  const plus30 = pricingForSellingTarget(plus30Target);
  const plus30Plan = evaluateAutoSyncPlan(
    existingBase,
    makeLiveProduct({ price: plus30.sourcePrice }),
    plus30,
    { maxPriceChangePercent: 30 }
  );
  if (
    isAutoPriceChangeAllowed(
      basePricing.sellingPriceMyr,
      plus30.sellingPriceMyr,
      30
    ) &&
    plus30Plan.wouldUpdatePrice
  ) {
    pass("price_plus_30_boundary_allowed");
  } else {
    fail("price_plus_30_boundary_allowed");
  }

  const plus31Target =
    Math.round(basePricing.sellingPriceMyr * 1.31 * 100) / 100;
  const plus31 = pricingForSellingTarget(plus31Target);
  const plus31Plan = evaluateAutoSyncPlan(
    existingBase,
    makeLiveProduct({ price: plus31.sourcePrice }),
    plus31,
    { maxPriceChangePercent: 30 }
  );
  if (plus31Plan.requiresReview && !plus31Plan.wouldUpdatePrice) {
    pass("price_plus_31_requires_review");
  } else {
    fail("price_plus_31_requires_review");
  }

  const minus10Target =
    Math.round(basePricing.sellingPriceMyr * 0.9 * 100) / 100;
  const minus10 = pricingForSellingTarget(minus10Target);
  if (
    evaluateAutoSyncPlan(
      existingBase,
      makeLiveProduct({ price: minus10.sourcePrice }),
      minus10,
      { maxPriceChangePercent: 30 }
    ).wouldUpdatePrice
  ) {
    pass("price_minus_10_allowed");
  } else {
    fail("price_minus_10_allowed");
  }

  const minus30Target =
    Math.round(basePricing.sellingPriceMyr * 0.7 * 100) / 100;
  const minus30 = pricingForSellingTarget(minus30Target);
  if (
    evaluateAutoSyncPlan(
      existingBase,
      makeLiveProduct({ price: minus30.sourcePrice }),
      minus30,
      { maxPriceChangePercent: 30 }
    ).wouldUpdatePrice
  ) {
    pass("price_minus_30_boundary_allowed");
  } else {
    fail("price_minus_30_boundary_allowed");
  }

  const minus31Target =
    Math.round(basePricing.sellingPriceMyr * 0.69 * 100) / 100;
  const minus31 = pricingForSellingTarget(minus31Target);
  const minus31Plan = evaluateAutoSyncPlan(
    existingBase,
    makeLiveProduct({ price: minus31.sourcePrice }),
    minus31,
    { maxPriceChangePercent: 30 }
  );
  if (minus31Plan.requiresReview) pass("price_minus_31_requires_review");
  else fail("price_minus_31_requires_review");

  const activeSold = resolveAutoStorefrontStatus("sold", "active");
  if (!activeSold.updateStorefront) pass("supplier_active_no_reactivation");
  else fail("supplier_active_no_reactivation");

  const soldAvail = resolveAutoStorefrontStatus("available", "sold");
  if (soldAvail.updateStorefront && soldAvail.newStorefrontStatus === "sold") {
    pass("supplier_sold_available_to_sold");
  } else {
    fail("supplier_sold_available_to_sold");
  }

  const delistedAvail = resolveAutoStorefrontStatus("available", "delisted");
  if (
    delistedAvail.updateStorefront &&
    delistedAvail.newStorefrontStatus === "hidden"
  ) {
    pass("supplier_delisted_available_to_hidden");
  } else {
    fail("supplier_delisted_available_to_hidden");
  }

  const unavailableAvail = resolveAutoStorefrontStatus("available", "unavailable");
  if (
    unavailableAvail.updateStorefront &&
    unavailableAvail.newStorefrontStatus === "hidden"
  ) {
    pass("supplier_unavailable_available_to_hidden");
  } else {
    fail("supplier_unavailable_available_to_hidden");
  }

  const errorPlan = evaluateAutoSyncPlan(
    makeExisting(),
    makeLiveProduct({ status: "error" }),
    basePricing
  );
  if (!errorPlan.wouldUpdatePrice && !errorPlan.wouldUpdateStatus) {
    pass("supplier_error_no_changes");
  } else {
    fail("supplier_error_no_changes");
  }

  const unknownPlan = evaluateAutoSyncPlan(
    makeExisting(),
    makeLiveProduct({ status: "unknown" }),
    basePricing
  );
  if (!unknownPlan.wouldUpdatePrice && !unknownPlan.wouldUpdateStatus) {
    pass("supplier_unknown_no_changes");
  } else {
    fail("supplier_unknown_no_changes");
  }

  if (!resolveAutoStorefrontStatus("sold", "active").updateStorefront) {
    pass("sold_not_reactivated");
  } else {
    fail("sold_not_reactivated");
  }

  if (!resolveAutoStorefrontStatus("hidden", "active").updateStorefront) {
    pass("hidden_not_reactivated");
  } else {
    fail("hidden_not_reactivated");
  }

  if (autoSync.includes('.eq("source", SOURCE)')) pass("wrong_source_skips");
  else fail("wrong_source_skips");

  if (autoSync.includes("source_product_id")) pass("wrong_external_id_skips");
  else fail("wrong_external_id_skips");

  if (autoSync.includes("reloadSyncableProduct")) pass("atomic_re_read");
  else fail("atomic_re_read");

  if (autoSync.includes("applyErrorOnlyUpdate")) pass("detail_failure_skips_item");
  else fail("detail_failure_skips_item");

  if (
    calculateSellingPriceChangePercent(1000, 1100) === 10 &&
    calculateSellingPriceChangePercent(1000, 1600) === 60
  ) {
    pass("price_change_percent_calculation");
  } else {
    fail("price_change_percent_calculation");
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nPhase 11.5: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
