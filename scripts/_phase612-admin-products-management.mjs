/**
 * Phase 6.12 — admin products management UX + mark sold tests.
 * Run: node scripts/_phase612-admin-products-management.mjs
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

const productsPage = read("app/admin/products/page.tsx");
const productEdit = read("app/admin/products/[id]/edit/page.tsx");
const statusApi = read("app/api/admin/products/status/route.ts");
const confirmDialog = read("components/admin/ConfirmDialog.tsx");
const statusControl = read("components/admin/ProductListingStatusControl.tsx");
const inventoryStock = read("lib/inventory-stock.ts");
const stripeWebhook = read("app/api/stripe/webhook/route.ts");
const checkoutApi = read("app/api/checkout/create-session/route.ts");
const deliverEmail = read("app/api/admin/inventory/deliver-email/route.ts");
const manualFulfill = read("app/api/admin/orders/manual-fulfill/route.ts");
const inventoryApi = read("app/api/admin/inventory/route.ts");

// 1. Admin products page exists
if (productsPage.includes("export default function ProductsPage")) {
  pass("admin_products_page_exists");
} else {
  fail("admin_products_page_exists");
}

// 2. Product table/list exists
if (productsPage.includes("<table") && productsPage.includes("<tbody")) {
  pass("product_table_exists");
} else {
  fail("product_table_exists");
}

// 3. Compact thumbnail exists
if (productsPage.includes("h-12 w-12") && productsPage.includes("object-cover")) {
  pass("compact_thumbnail_exists");
} else {
  fail("compact_thumbnail_exists");
}

// 4. Search remains available
if (productsPage.includes('placeholder="Search products..."')) {
  pass("search_available");
} else {
  fail("search_available");
}

// 5. Game filter remains available
if (productsPage.includes("All games") && productsPage.includes("gameFilter")) {
  pass("game_filter_available");
} else {
  fail("game_filter_available");
}

// 6. Status filter remains available
if (productsPage.includes("All statuses") && productsPage.includes("statusFilter")) {
  pass("status_filter_available");
} else {
  fail("status_filter_available");
}

// 7. Stock information remains available
if (
  productsPage.includes("formatAdminProductStockDisplay") &&
  productsPage.includes("stockFilter")
) {
  pass("stock_information_available");
} else {
  fail("stock_information_available");
}

// 8. Add Product action remains available
if (productsPage.includes("+ Add Product")) {
  pass("add_product_action");
} else {
  fail("add_product_action");
}

// 9. Mark Sold action exists
if (
  productsPage.includes("ProductListingStatusControl") &&
  statusControl.includes("Mark Sold")
) {
  pass("mark_sold_action_exists");
} else {
  fail("mark_sold_action_exists");
}

// 10. Mark Available action exists
if (
  productsPage.includes("ProductListingStatusControl") &&
  statusControl.includes("Mark Available")
) {
  pass("mark_available_action_exists");
} else {
  fail("mark_available_action_exists");
}

// 11. Mark Sold requires admin authorization
if (statusApi.includes("requireAdmin") && statusApi.includes("ALLOWED_STATUSES")) {
  pass("mark_sold_requires_admin");
} else {
  fail("mark_sold_requires_admin");
}

// 12. Mark Available requires admin authorization
if (statusApi.includes("requireAdmin") && statusApi.includes("available")) {
  pass("mark_available_requires_admin");
} else {
  fail("mark_available_requires_admin");
}

// 13. Status API updates products.status only
if (
  statusApi.includes('.from("products")') &&
  statusApi.includes(".update({") &&
  statusApi.includes("status") &&
  !statusApi.includes("inventory_items")
) {
  pass("status_updates_products_only");
} else {
  fail("status_updates_products_only");
}

// 14. Does not delete product
if (
  !statusApi.includes(".delete(") &&
  statusControl.includes("Inventory accounts are not deleted")
) {
  pass("does_not_delete_product");
} else {
  fail("does_not_delete_product");
}

// 15. Does not modify inventory_items
if (!statusApi.includes("inventory_items") && !statusControl.includes("inventory_items")) {
  pass("does_not_modify_inventory_items");
} else {
  fail("does_not_modify_inventory_items");
}

// 16. Does not modify inventory_credentials
if (
  !statusApi.includes("inventory_credentials") &&
  !productsPage.includes("inventory_credentials")
) {
  pass("does_not_modify_inventory_credentials");
} else {
  fail("does_not_modify_inventory_credentials");
}

// 17. Does not modify delivery_attempts
if (!statusApi.includes("delivery_attempts")) {
  pass("does_not_modify_delivery_attempts");
} else {
  fail("does_not_modify_delivery_attempts");
}

// 18. Double-submit protection exists
if (
  statusControl.includes("disabled={loading}") &&
  statusControl.includes("Marking sold")
) {
  pass("double_submit_protection");
} else {
  fail("double_submit_protection");
}

// 19. Confirmation dialog exists
if (
  confirmDialog.includes('role="dialog"') &&
  statusControl.includes("ConfirmDialog") &&
  !statusControl.includes("window.confirm")
) {
  pass("confirmation_dialog_exists");
} else {
  fail("confirmation_dialog_exists");
}

// 20. Mobile layout avoids wide table
if (
  productsPage.includes("lg:hidden") &&
  productsPage.includes("space-y-2 lg:hidden") &&
  !productsPage.includes("aspect-[16/9]")
) {
  pass("mobile_avoids_wide_table");
} else {
  fail("mobile_avoids_wide_table");
}

// 21. Mobile action targets at least 44px
if (productsPage.includes("min-h-11")) {
  pass("mobile_touch_targets_44px");
} else {
  fail("mobile_touch_targets_44px");
}

// 22. Product edit page includes status controls
if (
  productEdit.includes("ProductListingStatusControl") &&
  productEdit.includes("Manage Inventory")
) {
  pass("edit_page_status_controls");
} else {
  fail("edit_page_status_controls");
}

// 23. No Stripe files modified
if (checkoutApi.includes("getStripe") && !checkoutApi.includes("phase612")) {
  pass("stripe_checkout_unchanged");
} else {
  fail("stripe_checkout_unchanged");
}

// 24. No webhook files modified
if (stripeWebhook.includes("POST") && !stripeWebhook.includes("phase612")) {
  pass("stripe_webhook_unchanged");
} else {
  fail("stripe_webhook_unchanged");
}

// 25. No email delivery files modified
if (deliverEmail.includes("deliver-email") && !deliverEmail.includes("phase612")) {
  pass("email_delivery_unchanged");
} else {
  fail("email_delivery_unchanged");
}

// Extra: Phase 6.11 stock semantics reused in admin list
if (
  inventoryStock.includes("formatAdminProductStockDisplay") &&
  productsPage.includes("formatAdminProductStockDisplay")
) {
  pass("phase611_stock_semantics_reused");
} else {
  fail("phase611_stock_semantics_reused");
}

// Extra: manual fulfillment unchanged
if (manualFulfill.includes("manualFulfillOrderByEmail")) {
  pass("manual_fulfillment_unchanged");
} else {
  fail("manual_fulfillment_unchanged");
}

// Extra: inventory API unchanged pattern
if (inventoryApi.includes("requireAdmin") && !inventoryApi.includes("phase612")) {
  pass("inventory_api_unchanged");
} else {
  fail("inventory_api_unchanged");
}

// Extra: sticky desktop table header
if (productsPage.includes("sticky top-0")) {
  pass("desktop_sticky_header");
} else {
  fail("desktop_sticky_header");
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\nPhase 6.12 admin-products-management: ${results.length - failed.length}/${results.length} passed`
);
if (failed.length) process.exit(1);
