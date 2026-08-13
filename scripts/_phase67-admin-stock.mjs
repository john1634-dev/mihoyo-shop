/**
 * Phase 6.7 — admin stock UX + inventory stock model tests.
 * Run: npx --yes tsx scripts/_phase67-admin-stock.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const {
  aggregateProductStock,
  countSellableFromSummary,
  customerStockLabel,
  inventoryManageHref,
  isCustomerPurchasable,
  isSellableInventoryRow,
  matchesAdminStockFilter,
  stockLevelFromAvailable,
  stockLevelLabel,
} = await import("../lib/inventory-stock.ts");

const { getProductBadges } = await import("../lib/products-public.ts");

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

const results = [];

function pass(name) {
  results.push({ name, ok: true });
  console.log(`PASS ${name}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false });
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
}

// 1. Product status independent from inventory stock
const summaryPublishedZero = aggregateProductStock([
  { product_id: PRODUCT_ID, status: "delivered", order_id: "o1" },
]).get(PRODUCT_ID);
assert.equal(summaryPublishedZero?.available_count, 0);
pass("product_status_independent_from_stock");

// 2. available listing + 0 stock => Out of Stock label
assert.equal(
  customerStockLabel({ productStatus: "available", availableCount: 0 }),
  "Out of Stock"
);
pass("zero_stock_out_of_stock_label");

// 3. available listing + 50 stock => In Stock level
assert.equal(stockLevelFromAvailable(50), "in_stock");
assert.equal(stockLevelLabel("in_stock"), "In Stock");
pass("fifty_stock_in_stock");

// 4. One inventory row = one unit
const fiftyRows = Array.from({ length: 50 }, () => ({
  product_id: PRODUCT_ID,
  status: "available",
  order_id: null,
}));
const fiftySummary = aggregateProductStock(fiftyRows).get(PRODUCT_ID);
assert.equal(fiftySummary?.available_count, 50);
assert.equal(fiftySummary?.total_count, 50);
pass("one_row_one_unit");

// 5. available -> assigned decreases available by 1
const before = aggregateProductStock([
  { product_id: PRODUCT_ID, status: "available", order_id: null },
  { product_id: PRODUCT_ID, status: "available", order_id: null },
]).get(PRODUCT_ID);
const after = aggregateProductStock([
  { product_id: PRODUCT_ID, status: "assigned", order_id: "order-1" },
  { product_id: PRODUCT_ID, status: "available", order_id: null },
]).get(PRODUCT_ID);
assert.equal(before?.available_count, 2);
assert.equal(after?.available_count, 1);
assert.equal(after?.assigned_count, 1);
pass("assigned_decreases_available");

// 6. delivered not available
assert.equal(
  aggregateProductStock([
    { product_id: PRODUCT_ID, status: "delivered", order_id: "o1" },
  ]).get(PRODUCT_ID)?.available_count,
  0
);
pass("delivered_not_available");

// 7. void not available
assert.equal(
  aggregateProductStock([
    { product_id: PRODUCT_ID, status: "void", order_id: null },
  ]).get(PRODUCT_ID)?.available_count,
  0
);
pass("void_not_available");

// 8. assigned not available
assert.ok(!isSellableInventoryRow({ status: "assigned", order_id: "o1" }));
pass("assigned_not_sellable");

// 9. summary counts
const mixed = aggregateProductStock([
  { product_id: PRODUCT_ID, status: "available", order_id: null },
  { product_id: PRODUCT_ID, status: "available", order_id: null },
  { product_id: PRODUCT_ID, status: "assigned", order_id: "o1" },
  { product_id: PRODUCT_ID, status: "delivered", order_id: "o2" },
  { product_id: PRODUCT_ID, status: "void", order_id: null },
]).get(PRODUCT_ID);
assert.deepEqual(
  {
    available: mixed?.available_count,
    assigned: mixed?.assigned_count,
    delivered: mixed?.delivered_count,
    void: mixed?.void_count,
    total: mixed?.total_count,
  },
  { available: 2, assigned: 1, delivered: 1, void: 1, total: 5 }
);
pass("summary_counts_correct");

// 10. admin stock filters
assert.equal(matchesAdminStockFilter("out_of_stock", 0), true);
assert.equal(matchesAdminStockFilter("low_stock", 3), true);
assert.equal(matchesAdminStockFilter("in_stock", 10), true);
pass("admin_stock_filters");

// 11. purchasability helper
assert.equal(isCustomerPurchasable({ productStatus: "available", availableCount: 0 }), false);
assert.equal(isCustomerPurchasable({ productStatus: "available", availableCount: 2 }), true);
pass("customer_purchasability");

// 12. badges with stock
const badges = getProductBadges(
  {
    id: PRODUCT_ID,
    title: "Test",
    slug: "test",
    price: 1,
    currency: "MYR",
    status: "available",
    created_at: new Date().toISOString(),
  },
  0,
  true
);
assert.ok(badges.includes("SOLD_OUT"));
pass("badges_reflect_zero_stock");

// 13. manage inventory href
const href = inventoryManageHref(PRODUCT_ID);
assert.ok(href.includes(`product_id=${PRODUCT_ID}`));
assert.ok(href.includes("status=available"));
pass("inventory_manage_href");

// 14. source guards — no credentials in stock API/list
const stockApi = readFileSync("app/api/admin/inventory/stock/route.ts", "utf8");
const inventoryApi = readFileSync("app/api/admin/inventory/route.ts", "utf8");
const productsPage = readFileSync("app/admin/products/page.tsx", "utf8");

if (
  !stockApi.includes("ciphertext") &&
  !stockApi.includes("inventory_credentials") &&
  stockApi.includes("requireAdmin")
) {
  pass("stock_api_safe");
} else {
  fail("stock_api_safe");
}

if (
  inventoryApi.includes("toPublicInventoryItem") &&
  !inventoryApi.includes("decrypt")
) {
  pass("inventory_list_no_credentials");
} else {
  fail("inventory_list_no_credentials");
}

if (
  productsPage.includes("formatAdminProductStockDisplay") &&
  productsPage.includes("ProductListingStatusControl") &&
  productsPage.includes("lg:hidden")
) {
  pass("admin_products_stock_ui");
} else {
  fail("admin_products_stock_ui");
}

assert.equal(countSellableFromSummary({ product_id: PRODUCT_ID, available_count: 7, reserved_count: 0, assigned_count: 0, delivered_count: 0, consumed_count: 0, void_count: 0, total_count: 7 }), 7);
pass("count_sellable_from_summary");

const failed = results.filter((r) => !r.ok);
console.log(
  `\nPhase 6.7 admin-stock: ${results.length - failed.length}/${results.length} passed`
);
if (failed.length) process.exit(1);
