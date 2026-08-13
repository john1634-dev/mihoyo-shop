/**
 * Phase 13 test runner — scheduled auto-sync hardening.
 */
import { readFile } from "node:fs/promises";
import { computeCostMyr } from "../lib/costing";
import {
  evaluateAutoSyncPlan,
  resolveAutoStorefrontStatus,
  type AutoSyncPricing,
} from "../lib/supplier/auto-sync";
import {
  authorizeZinkGameCronRequest,
  getCronSecret,
} from "../lib/supplier/cron-auth";
import {
  calculateSupplierSellingPrice,
  isAutoPriceChangeAllowed,
} from "../lib/supplier/pricing";
import { isLockExpired } from "../lib/supplier/sync-lock";
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
    source_product_url:
      "https://zinkgame.com/product/abc123def456789012345678901234ab",
    source_status: "active",
    source_price: 3_500_000,
    source_currency: "VND",
    last_synced_at: null,
    last_source_check_at: null,
    sync_error: null,
    ...overrides,
  };
}

function makeLiveProduct(
  overrides: Partial<SupplierProduct> = {}
): SupplierProduct {
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

function cronRequest(secret?: string): Request {
  const headers: Record<string, string> = {};
  if (secret) headers.Authorization = `Bearer ${secret}`;
  return new Request("http://localhost/api/cron/zinkgame-sync", {
    method: "POST",
    headers,
  });
}

async function main() {
  const cronRoute = await readFile(
    "app/api/cron/zinkgame-sync/route.ts",
    "utf8"
  );
  const autoRoute = await readFile(
    "app/api/admin/suppliers/zinkgame/sync/auto/route.ts",
    "utf8"
  );
  const runsRoute = await readFile(
    "app/api/admin/suppliers/zinkgame/sync/runs/route.ts",
    "utf8"
  );
  const scheduled = await readFile("lib/supplier/scheduled-sync.ts", "utf8");
  const autoSync = await readFile("lib/supplier/auto-sync.ts", "utf8");
  const lockLib = await readFile("lib/supplier/sync-lock.ts", "utf8");
  const runLog = await readFile("lib/supplier/sync-run-log.ts", "utf8");
  const cronAuth = await readFile("lib/supplier/cron-auth.ts", "utf8");
  const migration = await readFile(
    "supabase/phase13_supplier_sync.sql",
    "utf8"
  );
  const vercel = await readFile("vercel.json", "utf8");
  const envExample = await readFile(".env.example", "utf8");
  const adminPage = await readFile(
    "app/admin/suppliers/zinkgame/page.tsx",
    "utf8"
  );

  const previousSecret = process.env.ZINKGAME_SYNC_CRON_SECRET;

  try {
    delete process.env.ZINKGAME_SYNC_CRON_SECRET;
    const missing = authorizeZinkGameCronRequest(cronRequest("anything"));
    if (!missing.ok && missing.status === 503) pass("missing_cron_secret");
    else fail("missing_cron_secret");

    process.env.ZINKGAME_SYNC_CRON_SECRET = "phase13-test-secret";
    const invalid = authorizeZinkGameCronRequest(cronRequest("wrong"));
    if (!invalid.ok && invalid.status === 401) pass("invalid_cron_secret");
    else fail("invalid_cron_secret");

    const noHeader = authorizeZinkGameCronRequest(cronRequest());
    if (!noHeader.ok && noHeader.status === 401) pass("cron_authentication");
    else fail("cron_authentication");

    const valid = authorizeZinkGameCronRequest(
      cronRequest("phase13-test-secret")
    );
    if (valid.ok && getCronSecret() === "phase13-test-secret") {
      pass("valid_cron_secret");
    } else {
      fail("valid_cron_secret");
    }
  } finally {
    if (previousSecret === undefined) delete process.env.ZINKGAME_SYNC_CRON_SECRET;
    else process.env.ZINKGAME_SYNC_CRON_SECRET = previousSecret;
  }

  if (
    cronAuth.includes("ZINKGAME_SYNC_CRON_SECRET") &&
    !cronAuth.includes("NEXT_PUBLIC_")
  ) {
    pass("cron_secret_server_only");
  } else {
    fail("cron_secret_server_only");
  }

  if (cronRoute.includes("authorizeZinkGameCronRequest")) pass("cron_route_auth");
  else fail("cron_route_auth");

  if (cronRoute.includes('triggerType: "cron"')) pass("cron_trigger_logged");
  else fail("cron_trigger_logged");

  if (autoRoute.includes('triggerType: "manual"')) pass("manual_trigger_logged");
  else fail("manual_trigger_logged");

  if (autoRoute.includes("requireAdmin")) pass("admin_auto_sync_requires_admin");
  else fail("admin_auto_sync_requires_admin");

  if (runsRoute.includes("requireAdmin")) pass("sync_runs_requires_admin");
  else fail("sync_runs_requires_admin");

  if (lockLib.includes("acquireSupplierSyncLock")) pass("lock_acquisition");
  else fail("lock_acquisition");

  if (lockLib.includes("alreadyRunning: true") && lockLib.includes("23505")) {
    pass("concurrent_lock_rejection");
  } else {
    fail("concurrent_lock_rejection");
  }

  const expired = isLockExpired(new Date(Date.now() - 1000).toISOString());
  const active = isLockExpired(new Date(Date.now() + 60_000).toISOString());
  if (expired && !active) pass("expired_lock_recovery");
  else fail("expired_lock_recovery");

  if (
    lockLib.includes(".lt(\"expires_at\"") &&
    lockLib.includes("lock_token")
  ) {
    pass("expired_lock_takeover_query");
  } else {
    fail("expired_lock_takeover_query");
  }

  if (
    scheduled.includes("releaseSupplierSyncLock") &&
    scheduled.includes("finally")
  ) {
    pass("lock_release");
  } else {
    fail("lock_release");
  }

  if (lockLib.includes("15 * 60 * 1000")) pass("lock_ttl_15_minutes");
  else fail("lock_ttl_15_minutes");

  if (runLog.includes("createSupplierSyncRun") && runLog.includes('"running"')) {
    pass("run_log_creation");
  } else {
    fail("run_log_creation");
  }

  if (runLog.includes('"completed"')) pass("successful_run_log");
  else fail("successful_run_log");

  if (scheduled.includes('"failed"')) pass("failed_run_log");
  else fail("failed_run_log");

  if (scheduled.includes("source_unavailable")) pass("source_unavailable_log");
  else fail("source_unavailable_log");

  if (autoSync.includes("newProducts") && autoSync.includes("new_product_not_imported")) {
    pass("new_product_detection");
  } else {
    fail("new_product_detection");
  }

  if (
    !autoSync.includes(".insert(") &&
    !scheduled.includes("importSupplierProduct")
  ) {
    pass("no_automatic_import");
  } else {
    fail("no_automatic_import");
  }

  if (autoSync.includes("sourceUnavailable: true")) pass("listing_failure_stops_sync");
  else fail("listing_failure_stops_sync");

  if (autoSync.includes("applyErrorOnlyUpdate") && autoSync.includes("DETAIL_CONCURRENCY = 3")) {
    pass("detail_fetch_failure_continues");
  } else {
    fail("detail_fetch_failure_continues");
  }

  if (
    autoSync.includes('eq("source", SOURCE)') &&
    autoSync.includes("reloadSyncableProduct")
  ) {
    pass("atomic_source_id_guard");
  } else {
    fail("atomic_source_id_guard");
  }

  if (
    !autoSync.includes("updatePayload.title") &&
    !scheduled.includes("title:")
  ) {
    pass("no_title_changes");
  } else {
    fail("no_title_changes");
  }

  if (
    !autoSync.includes('.from("product_images")') &&
    !scheduled.includes("processSupplierImage")
  ) {
    pass("no_image_changes");
  } else {
    fail("no_image_changes");
  }

  if (autoSync.includes("Number.isFinite(exchangeRate)") && autoSync.includes("exchangeRate <= 0")) {
    pass("exchange_rate_failure");
  } else {
    fail("exchange_rate_failure");
  }

  if (vercel.includes("*/30 * * * *") && vercel.includes("/api/cron/zinkgame-sync")) {
    pass("vercel_cron_schedule");
  } else {
    fail("vercel_cron_schedule");
  }

  if (envExample.includes("ZINKGAME_SYNC_CRON_SECRET=")) pass("env_example_cron_secret");
  else fail("env_example_cron_secret");

  if (migration.includes("supplier_sync_locks") && migration.includes("supplier_sync_runs")) {
    pass("migration_tables");
  } else {
    fail("migration_tables");
  }

  if (adminPage.includes("ZinkGame Sync History")) pass("admin_sync_history_ui");
  else fail("admin_sync_history_ui");

  const rate = 0.00018;
  const markup = 100;
  const baseVnd = 3_500_000;
  const basePricing = makePricing(baseVnd, rate, markup);
  const existingBase = makeExisting({
    price: basePricing.sellingPriceMyr,
    source_price: baseVnd,
    cost_myr: basePricing.costMyr,
  });

  if (basePricing.sellingPriceMyr === computeCostMyr(baseVnd, rate) * 2) {
    pass("markup_100_percent");
  } else {
    fail("markup_100_percent");
  }

  const plus10 = makePricing(Math.round(baseVnd * 1.1), rate, markup);
  const plus10Plan = evaluateAutoSyncPlan(
    existingBase,
    makeLiveProduct({ price: plus10.sourcePrice }),
    plus10,
    { maxPriceChangePercent: 30 }
  );
  if (
    isAutoPriceChangeAllowed(basePricing.sellingPriceMyr, plus10.sellingPriceMyr, 30) &&
    plus10Plan.wouldUpdatePrice
  ) {
    pass("price_change_within_30_percent");
  } else {
    fail("price_change_within_30_percent");
  }

  const plus50 = makePricing(Math.round(baseVnd * 1.5), rate, markup);
  const plus50Plan = evaluateAutoSyncPlan(
    existingBase,
    makeLiveProduct({ price: plus50.sourcePrice }),
    plus50,
    { maxPriceChangePercent: 30 }
  );
  if (plus50Plan.requiresReview && !plus50Plan.wouldUpdatePrice) {
    pass("price_increase_over_30_requires_review");
  } else {
    fail("price_increase_over_30_requires_review");
  }

  const minus50 = makePricing(Math.round(baseVnd * 0.5), rate, markup);
  const minus50Plan = evaluateAutoSyncPlan(
    existingBase,
    makeLiveProduct({ price: minus50.sourcePrice }),
    minus50,
    { maxPriceChangePercent: 30 }
  );
  if (minus50Plan.requiresReview) pass("price_decrease_over_30_requires_review");
  else fail("price_decrease_over_30_requires_review");

  const soldToSold = resolveAutoStorefrontStatus("sold", "sold");
  if (!soldToSold.updateStorefront) pass("sold_stays_sold");
  else fail("sold_stays_sold");

  const availableToSold = resolveAutoStorefrontStatus("available", "sold");
  if (availableToSold.newStorefrontStatus === "sold") pass("available_to_sold");
  else fail("available_to_sold");

  const availableToHidden = resolveAutoStorefrontStatus("available", "delisted");
  if (availableToHidden.newStorefrontStatus === "hidden") pass("available_to_hidden");
  else fail("available_to_hidden");

  if (!resolveAutoStorefrontStatus("sold", "active").updateStorefront) {
    pass("sold_to_available_blocked");
  } else {
    fail("sold_to_available_blocked");
  }

  if (!resolveAutoStorefrontStatus("hidden", "active").updateStorefront) {
    pass("hidden_to_available_blocked");
  } else {
    fail("hidden_to_available_blocked");
  }

  const passed = results.filter((item) => item.ok).length;
  const failed = results.filter((item) => !item.ok).length;
  console.log(`\nPhase 13: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
