/**
 * Phase 6.11 — storefront stock display + responsive product grid tests.
 * Run: npx --yes tsx scripts/_phase611-storefront-stock-grid.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const {
  isInventoryManagedProduct,
  resolveCustomerStockDisplay,
  resolveCustomerStockDisplayFromSummary,
  stockLevelFromAvailable,
} = await import("../lib/inventory-stock.ts");

const { getProductBadges } = await import("../lib/products-public.ts");

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

const productCard = read("components/ProductCard.tsx");
const productDetail = read("app/product/[slug]/page.tsx");
const productsClient = read("components/ProductsClient.tsx");
const homePage = read("app/page.tsx");
const productsPage = read("app/products/page.tsx");
const stripeWebhook = read("app/api/stripe/webhook/route.ts");
const checkoutApi = read("app/api/checkout/create-session/route.ts");
const deliverEmail = read("app/api/admin/inventory/deliver-email/route.ts");
const manualFulfill = read("app/api/admin/orders/manual-fulfill/route.ts");
const stockApi = read("app/api/admin/inventory/stock/route.ts");

// 1. ProductCard uses shared stock semantics
if (
  productCard.includes("resolveCustomerStockDisplayFromSummary") &&
  productCard.includes("stockSummary")
) {
  pass("product_card_shared_stock_semantics");
} else {
  fail("product_card_shared_stock_semantics");
}

// 2. Product detail uses the same stock semantics
if (
  productDetail.includes("resolveCustomerStockDisplayFromSummary") &&
  productDetail.includes("stockDisplay.label")
) {
  pass("product_detail_shared_stock_semantics");
} else {
  fail("product_detail_shared_stock_semantics");
}

// 3. Inventory-managed product with stock > 5 displays In Stock
const inStock = resolveCustomerStockDisplay({
  productStatus: "available",
  availableCount: 10,
  inventoryManaged: true,
});
assert.equal(inStock.label, "In Stock");
assert.equal(stockLevelFromAvailable(10), "in_stock");
pass("inventory_managed_in_stock");

// 4. Inventory-managed product with stock 1–5 displays Low Stock
const lowStock = resolveCustomerStockDisplay({
  productStatus: "available",
  availableCount: 3,
  inventoryManaged: true,
});
assert.equal(lowStock.label, "Low Stock");
pass("inventory_managed_low_stock");

// 5. Inventory-managed product with stock 0 displays Out of Stock
const outStock = resolveCustomerStockDisplay({
  productStatus: "available",
  availableCount: 0,
  inventoryManaged: true,
});
assert.equal(outStock.label, "Out of Stock");
assert.ok(outStock.showSoldOutBadge);
pass("inventory_managed_out_of_stock");

// 6. Manual-source product without inventory rows is not Sold Out
const manual = resolveCustomerStockDisplayFromSummary({
  productStatus: "available",
  summary: { available_count: 0, total_count: 0 },
});
assert.equal(manual.label, "Available");
assert.equal(manual.inventoryManaged, false);
assert.ok(!manual.showSoldOutBadge);
assert.ok(!isInventoryManagedProduct({ total_count: 0 }));
pass("manual_source_not_sold_out");

// 7. Products page uses 3 columns on mobile
if (
  productsClient.includes("grid-cols-3") &&
  homePage.includes("grid-cols-3") &&
  productDetail.includes("grid-cols-3")
) {
  pass("mobile_three_column_grid");
} else {
  fail("mobile_three_column_grid");
}

// 8. Desktop uses 4+ columns
if (
  productsClient.includes("lg:grid-cols-4") &&
  productsClient.includes("xl:grid-cols-5")
) {
  pass("desktop_four_plus_columns");
} else {
  fail("desktop_four_plus_columns");
}

// 9. No horizontal overflow-prone fixed width on product card
if (
  !productCard.match(/w-\[[3-9]\d{2,}px\]/) &&
  productCard.includes("aspect-[4/3]") &&
  productCard.includes("line-clamp-2")
) {
  pass("no_overflow_prone_fixed_width");
} else {
  fail("no_overflow_prone_fixed_width");
}

// 10. Existing stock API remains admin-protected
if (stockApi.includes("requireAdmin") && !stockApi.includes("ciphertext")) {
  pass("stock_api_admin_protected");
} else {
  fail("stock_api_admin_protected");
}

// 11. Checkout files are unchanged
if (
  checkoutApi.includes("getStripe") &&
  checkoutApi.includes("export async function POST") &&
  !checkoutApi.includes("phase611")
) {
  pass("checkout_unchanged");
} else {
  fail("checkout_unchanged");
}

// 12. Stripe webhook is unchanged
if (stripeWebhook.includes("POST") && !stripeWebhook.includes("phase611")) {
  pass("stripe_webhook_unchanged");
} else {
  fail("stripe_webhook_unchanged");
}

// 13. Email delivery files are unchanged
if (deliverEmail.includes("deliver-email") && !deliverEmail.includes("phase611")) {
  pass("email_delivery_unchanged");
} else {
  fail("email_delivery_unchanged");
}

// 14. Manual fulfillment files are unchanged
if (
  manualFulfill.includes("manualFulfillOrderByEmail") &&
  !manualFulfill.includes("phase611")
) {
  pass("manual_fulfillment_unchanged");
} else {
  fail("manual_fulfillment_unchanged");
}

// 15. Product detail and ProductCard use consistent stock behavior
const cardUsesHelper = productCard.includes("resolveCustomerStockDisplayFromSummary");
const detailUsesHelper = productDetail.includes("resolveCustomerStockDisplayFromSummary");
const OLD_DATE = "2020-01-01T00:00:00.000Z";
const badgesRespectInventory = getProductBadges(
  {
    id: "x",
    title: "t",
    slug: "t",
    price: 1,
    currency: "MYR",
    status: "available",
    created_at: OLD_DATE,
  },
  0,
  false
).length === 0;
const badgesInventoryZero = getProductBadges(
  {
    id: "x",
    title: "t",
    slug: "t",
    price: 1,
    currency: "MYR",
    status: "available",
    created_at: OLD_DATE,
  },
  0,
  true
).includes("SOLD_OUT");

if (
  cardUsesHelper &&
  detailUsesHelper &&
  badgesRespectInventory &&
  badgesInventoryZero &&
  productsPage.includes("fetchProductStockSummaryMap")
) {
  pass("consistent_stock_behavior");
} else {
  fail("consistent_stock_behavior");
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\nPhase 6.11 storefront-stock-grid: ${results.length - failed.length}/${results.length} passed`
);
if (failed.length) process.exit(1);
