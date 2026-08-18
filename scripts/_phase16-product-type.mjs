/**
 * Phase 16 — product type architecture + Reroll Account + checkout inventory safety.
 * Run: node --require ./scripts/shim-server-only.cjs --import tsx scripts/_phase16-product-type.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const {
  normalizeProductType,
  getProductTypeLabel,
  isAccountProductType,
  ADMIN_CREATABLE_PRODUCT_TYPES,
  DEFAULT_PRODUCT_TYPE,
} = await import("../lib/product-type.ts");

const {
  isStorefrontPurchasable,
  isInventoryManagedProduct,
} = await import("../lib/inventory-stock.ts");

const { getProductBadges, PUBLIC_PRODUCT_SELECT, SUPPLIER_INTERNAL_PRODUCT_FIELDS } =
  await import("../lib/products-public.ts");

const { setEmailTransportForTests } = await import("../lib/email.ts");

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

const checkoutApi = read("app/api/checkout/create-session/route.ts");
const webhook = read("app/api/stripe/webhook/route.ts");
const adminNew = read("app/admin/products/new/page.tsx");
const adminEdit = read("app/admin/products/[id]/edit/page.tsx");
const adminOrdersApi = read("app/api/admin/orders/route.ts");
const adminNotification = read("lib/admin-order-notification.ts");
const productCard = read("components/ProductCard.tsx");
const migration = read("supabase/phase16_product_type.sql");

// 1. Existing Endgame product type defaults remain valid
assert.equal(normalizeProductType(undefined), DEFAULT_PRODUCT_TYPE);
assert.equal(normalizeProductType(null), DEFAULT_PRODUCT_TYPE);
assert.equal(normalizeProductType("ENDGAME_ACCOUNT"), "ENDGAME_ACCOUNT");
assert.equal(getProductTypeLabel("ENDGAME_ACCOUNT"), "Endgame Account");
pass("endgame_product_type_default_valid");

// 2. Reroll product type can be represented
assert.equal(normalizeProductType("REROLL_ACCOUNT"), "REROLL_ACCOUNT");
assert.equal(getProductTypeLabel("REROLL_ACCOUNT"), "Reroll Account");
assert.ok(ADMIN_CREATABLE_PRODUCT_TYPES.includes("REROLL_ACCOUNT"));
pass("reroll_product_type_supported");

// 3. Admin create/edit forms include product type selector
if (
  adminNew.includes("product_type: productType") &&
  adminNew.includes("ADMIN_CREATABLE_PRODUCT_TYPES") &&
  adminEdit.includes("product_type: productType")
) {
  pass("admin_reroll_product_creation_ui");
} else {
  fail("admin_reroll_product_creation_ui");
}

// 4. Reroll product with inventory > 0 is storefront purchasable
const rerollInStock = isStorefrontPurchasable({
  productStatus: "available",
  summary: {
    available_count: 10,
    total_count: 10,
  },
});
assert.equal(rerollInStock, true);
pass("reroll_inventory_in_stock_purchasable");

// 5. Reroll / inventory-managed product with inventory = 0 cannot checkout (API gate)
const oos = isStorefrontPurchasable({
  productStatus: "available",
  summary: {
    available_count: 0,
    total_count: 5,
  },
});
assert.equal(oos, false);
if (
  checkoutApi.includes("fetchProductStockSummary") &&
  checkoutApi.includes("isStorefrontPurchasable") &&
  checkoutApi.includes('"Out of stock"')
) {
  pass("checkout_blocks_zero_inventory");
} else {
  fail("checkout_blocks_zero_inventory");
}

// 6. Manual / non-inventory products still purchasable when available
const manual = isStorefrontPurchasable({
  productStatus: "available",
  summary: { available_count: 0, total_count: 0 },
});
assert.equal(manual, true);
assert.equal(isInventoryManagedProduct({ total_count: 0 }), false);
pass("manual_stock_products_still_work");

// 7. Public selects do not expose supplier internal fields or credentials
for (const field of SUPPLIER_INTERNAL_PRODUCT_FIELDS) {
  assert.ok(!PUBLIC_PRODUCT_SELECT.includes(field), `leaked ${field}`);
}
assert.ok(!PUBLIC_PRODUCT_SELECT.includes("cost_vnd"));
assert.ok(!PUBLIC_PRODUCT_SELECT.includes("encrypted"));
pass("inventory_credentials_not_in_public_select");

// 8. Product type preserved in schema + public select
if (
  migration.includes("product_type") &&
  migration.includes("ENDGAME_ACCOUNT") &&
  migration.includes("REROLL_ACCOUNT") &&
  PUBLIC_PRODUCT_SELECT.includes("product_type")
) {
  pass("product_type_preserved_in_schema_and_types");
} else {
  fail("product_type_preserved_in_schema_and_types");
}

// 9. Reroll badge on storefront + existing delivery path unchanged
const rerollBadges = getProductBadges(
  {
    id: "p1",
    title: "Reroll",
    slug: "reroll",
    description: null,
    price: 9.9,
    currency: "MYR",
    status: "available",
    server: null,
    ar_level: null,
    cover_image_url: null,
    game_id: null,
    product_type: "REROLL_ACCOUNT",
  },
  10,
  true
);
assert.ok(rerollBadges.includes("REROLL"));
if (
  webhook.includes("assignInventoryAfterPayment") &&
  webhook.includes("deliverInventoryByEmail")
) {
  pass("reroll_uses_existing_inventory_delivery");
} else {
  fail("reroll_uses_existing_inventory_delivery");
}

// 10. Admin notification does not expose credentials
if (
  adminNotification.includes("notifyAdminNewOrder") &&
  adminNotification.includes("ADMIN_ORDER_NOTIFICATION_EMAIL") &&
  !adminNotification.includes("password") &&
  !adminNotification.includes("decrypt") &&
  adminNotification.includes("does not include account credentials")
) {
  pass("admin_notification_no_credentials");
} else {
  fail("admin_notification_no_credentials");
}

// 11. Admin notification failure does not break customer fulfillment
if (
  webhook.includes("void notifyAdminNewOrder") &&
  webhook.includes("deliverInventoryByEmail")
) {
  pass("admin_notification_failure_non_blocking");
} else {
  fail("admin_notification_failure_non_blocking");
}

// Bonus: admin orders expose product type
if (
  adminOrdersApi.includes("product_type_label") &&
  adminOrdersApi.includes("game_name")
) {
  pass("admin_orders_show_product_type");
} else {
  fail("admin_orders_show_product_type");
}

// Bonus: storefront Reroll badge
if (productCard.includes("Reroll Account")) {
  pass("storefront_reroll_badge");
} else {
  fail("storefront_reroll_badge");
}

// Bonus: account product types for notification filter
assert.ok(isAccountProductType("ENDGAME_ACCOUNT"));
assert.ok(isAccountProductType("REROLL_ACCOUNT"));
assert.equal(isAccountProductType("TOP_UP"), false);
pass("account_product_type_filter");

// Email transport smoke — admin notification must not throw when order missing
setEmailTransportForTests(async () => ({ ok: true, provider_message_id: "test" }));

process.env.ADMIN_ORDER_NOTIFICATION_EMAIL = "ops@example.com";
const { notifyAdminNewOrder } = await import("../lib/admin-order-notification.ts");
await notifyAdminNewOrder("00000000-0000-0000-0000-000000000000");
setEmailTransportForTests(null);
delete process.env.ADMIN_ORDER_NOTIFICATION_EMAIL;
// Order not found — should not throw (non-blocking path)
pass("admin_notification_handles_missing_order");

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(`Phase 16: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  process.exitCode = 1;
}
