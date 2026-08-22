/**
 * Phase 25.1 — bulk delete performance + progress.
 * Run: node --import tsx scripts/_phase25_1-bulk-delete-performance.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const {
  ADMIN_BULK_DELETE_MAX,
  ADMIN_BULK_DELETE_CHUNK_SIZE,
  ADMIN_BULK_DELETE_CONCURRENCY,
  chunkIds,
  formatBulkDeleteProgress,
  summarizeBulkDeleteTotals,
} = await import("../lib/admin-bulk-delete-config.ts");

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

const adminProductsPage = read("app/admin/products/page.tsx");
const bulkDeleteRoute = read("app/api/admin/products/bulk-delete/route.ts");
const adminDeleteLib = read("lib/admin-product-delete.ts");

try {
  const ids = Array.from({ length: 50 }, (_, index) => `id-${index}`);
  const chunks = chunkIds(ids);
  assert.equal(chunks.length, 10);
  assert.equal(chunks[0]?.length, 5);
  assert.equal(chunks[9]?.length, 5);
  assert.equal(ADMIN_BULK_DELETE_CHUNK_SIZE, 5);
  pass("fifty_ids_split_into_chunks_of_five");
} catch (error) {
  fail("fifty_ids_split_into_chunks_of_five", error.message);
}

try {
  assert.equal(formatBulkDeleteProgress(5, 50), "Deleting 5 / 50…");
  assert.equal(formatBulkDeleteProgress(10, 50), "Deleting 10 / 50…");
  pass("progress_calculation");
} catch (error) {
  fail("progress_calculation", error.message);
}

try {
  assert.equal(
    summarizeBulkDeleteTotals({ deleted: 3, hidden: 2, failed: 1 }),
    "3 deleted, 2 hidden, 1 failed."
  );
  pass("deleted_hidden_failed_summary");
} catch (error) {
  fail("deleted_hidden_failed_summary", error.message);
}

try {
  if (
    adminProductsPage.includes("chunkIds") &&
    adminProductsPage.includes("for (const chunk of chunks)") &&
    adminProductsPage.includes("failed += chunk.length") &&
    adminProductsPage.includes("bulkDeleteLoading) return")
  ) {
    pass("partial_failures_continue_processing");
  } else {
    fail("partial_failures_continue_processing");
  }
} catch (error) {
  fail("partial_failures_continue_processing", error.message);
}

try {
  if (
    adminDeleteLib.includes("mapWithConcurrency") &&
    adminDeleteLib.includes("ADMIN_BULK_DELETE_CONCURRENCY") &&
    !adminDeleteLib.includes("Promise.all(uniqueIds.map")
  ) {
    pass("bounded_concurrency_on_server");
  } else {
    fail("bounded_concurrency_on_server");
  }
} catch (error) {
  fail("bounded_concurrency_on_server", error.message);
}

try {
  assert.equal(ADMIN_BULK_DELETE_CONCURRENCY, 3);
  pass("concurrency_limit_is_three");
} catch (error) {
  fail("concurrency_limit_is_three", error.message);
}

try {
  if (
    adminDeleteLib.includes("loadProductIdsWithOrderHistory") &&
    adminDeleteLib.includes('.in("product_id", productIds)') &&
    adminDeleteLib.includes('reason: "has_order_history"') &&
    adminDeleteLib.includes("hasOrderHistory: orderHistoryIds.has(productId)")
  ) {
    pass("order_history_protection_batch_query");
  } else {
    fail("order_history_protection_batch_query");
  }
} catch (error) {
  fail("order_history_protection_batch_query", error.message);
}

try {
  if (
    adminDeleteLib.includes("storage_cleanup_failed") &&
    adminDeleteLib.includes("storageCleanupFailed: true") &&
    adminDeleteLib.includes("Product was not deleted to avoid inconsistent state")
  ) {
    pass("storage_cleanup_failure_blocks_db_delete");
  } else {
    fail("storage_cleanup_failure_blocks_db_delete");
  }
} catch (error) {
  fail("storage_cleanup_failure_blocks_db_delete", error.message);
}

try {
  assert.equal(ADMIN_BULK_DELETE_MAX, 50);
  if (
    bulkDeleteRoute.includes("maxDuration = 60") &&
    adminProductsPage.includes("formatBulkDeleteProgress") &&
    adminProductsPage.includes("reloadProducts")
  ) {
    pass("runtime_and_refresh_behavior");
  } else {
    fail("runtime_and_refresh_behavior");
  }
} catch (error) {
  fail("runtime_and_refresh_behavior", error.message);
}

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\nPhase 25.1: ${passed}/${results.length} passed${failed ? `, ${failed} failed` : ""}`);
process.exit(failed ? 1 : 0);
