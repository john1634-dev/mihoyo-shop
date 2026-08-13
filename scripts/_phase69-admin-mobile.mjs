/**
 * Phase 6.9 — admin mobile UX polish regression tests.
 * Run: node scripts/_phase69-admin-mobile.mjs
 */
import { readFileSync, readdirSync } from "node:fs";

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

const adminShell = read("components/AdminShell.tsx");
const productsPage = read("app/admin/products/page.tsx");
const productEdit = read("app/admin/products/[id]/edit/page.tsx");
const productNew = read("app/admin/products/new/page.tsx");
const inventoryPage = read("app/admin/inventory/page.tsx");
const ordersPage = read("app/admin/orders/page.tsx");
const orderDetail = read("app/admin/orders/[id]/page.tsx");
const stockSummary = read("components/admin/ProductStockSummary.tsx");
const registerPage = read("app/register/page.tsx");
const authCallback = read("app/auth/callback/page.tsx");
const stripeWebhook = read("app/api/stripe/webhook/route.ts");
const manualFulfill = read("app/api/admin/orders/manual-fulfill/route.ts");
const deliverEmail = read("app/api/admin/inventory/deliver-email/route.ts");

// 1. AdminShell mobile menu exists
if (
  adminShell.includes("admin-mobile-nav") &&
  adminShell.includes("menuOpen") &&
  adminShell.includes("md:hidden")
) {
  pass("admin_shell_mobile_menu");
} else {
  fail("admin_shell_mobile_menu");
}

// 2. Mobile navigation has accessible controls
if (
  adminShell.includes("aria-expanded") &&
  adminShell.includes("aria-controls") &&
  adminShell.includes("aria-label") &&
  adminShell.includes("min-h-11")
) {
  pass("admin_shell_accessible_nav");
} else {
  fail("admin_shell_accessible_nav");
}

// 3. Products page has responsive mobile layout
if (
  productsPage.includes("lg:hidden") &&
  productsPage.includes("hidden overflow-hidden") &&
  productsPage.includes("line-clamp-2") &&
  productsPage.includes("overflow-x-hidden")
) {
  pass("products_responsive_mobile");
} else {
  fail("products_responsive_mobile");
}

// 4. Products page has stock UI
if (
  productsPage.includes("ProductStockBadge") &&
  productsPage.includes("formatAdminStockLine") &&
  productsPage.includes("stockFilter")
) {
  pass("products_stock_ui");
} else {
  fail("products_stock_ui");
}

// 5. Product edit has responsive sections
if (
  productEdit.includes("Basic Information") &&
  productEdit.includes("Pricing") &&
  productEdit.includes("Product Status") &&
  productEdit.includes("Description") &&
  productEdit.includes("ProductStockSummaryPanel") &&
  productEdit.includes("fixed inset-x-0 bottom-0")
) {
  pass("product_edit_sections");
} else {
  fail("product_edit_sections");
}

// 6. Inventory page has mobile layout
if (
  inventoryPage.includes("lg:hidden") &&
  inventoryPage.includes("InventoryItemActions") &&
  inventoryPage.includes("overflow-x-hidden")
) {
  pass("inventory_mobile_layout");
} else {
  fail("inventory_mobile_layout");
}

// 7. Orders page has mobile layout
if (
  ordersPage.includes("Needs Manual Account") &&
  ordersPage.includes("View / Fulfill") &&
  ordersPage.includes("min-h-11") &&
  ordersPage.includes("overflow-x-hidden")
) {
  pass("orders_mobile_layout");
} else {
  fail("orders_mobile_layout");
}

// 8. Order detail has responsive layout
if (
  orderDetail.includes("Manual Account Entry") &&
  orderDetail.includes("type=\"password\"") &&
  orderDetail.includes("Send account email") &&
  orderDetail.includes("overflow-x-hidden")
) {
  pass("order_detail_responsive");
} else {
  fail("order_detail_responsive");
}

// 9. Buttons have appropriate mobile sizing
if (
  productsPage.includes("min-h-11") &&
  productEdit.includes("min-h-11") &&
  orderDetail.includes("min-h-11 w-full")
) {
  pass("mobile_touch_targets");
} else {
  fail("mobile_touch_targets");
}

// 10. No forbidden credential rendering in inventory list UI
if (
  !inventoryPage.includes("ciphertext") &&
  !inventoryPage.includes("decrypt") &&
  inventoryPage.includes("Credentials never appear here")
) {
  pass("inventory_no_credentials_ui");
} else {
  fail("inventory_no_credentials_ui");
}

// 11. Existing stock helper is reused
if (
  productsPage.includes("@/lib/inventory-stock") &&
  stockSummary.includes("@/lib/inventory-stock") &&
  inventoryPage.includes("@/lib/inventory-stock")
) {
  pass("stock_helper_reused");
} else {
  fail("stock_helper_reused");
}

// 12. No products.stock introduced
const adminFiles = [
  productsPage,
  productEdit,
  productNew,
  inventoryPage,
  ordersPage,
  orderDetail,
  stockSummary,
];
if (!adminFiles.some((file) => /products\.stock|product\.stock/.test(file))) {
  pass("no_products_stock_field");
} else {
  fail("no_products_stock_field");
}

// 13. No database migration introduced
let migrationAdded = false;
try {
  const migrations = readdirSync("supabase/migrations");
  migrationAdded = migrations.some((name) =>
    /phase.?6.?9|admin.?mobile/i.test(name)
  );
} catch {
  // no migrations dir — fine
}
if (!migrationAdded) pass("no_db_migration");
else fail("no_db_migration");

// 14. Manual fulfillment endpoint unchanged (still exists with same route)
if (
  manualFulfill.includes("manual-fulfill") ||
  manualFulfill.includes("manualFulfill")
) {
  pass("manual_fulfill_endpoint_unchanged");
} else {
  fail("manual_fulfill_endpoint_unchanged");
}

// 15. Email delivery endpoint unchanged
if (deliverEmail.includes("deliver-email") && deliverEmail.includes("POST")) {
  pass("deliver_email_endpoint_unchanged");
} else {
  fail("deliver_email_endpoint_unchanged");
}

// 16. Stripe webhook unchanged (file still present, no mobile edits)
if (
  stripeWebhook.includes("stripe") &&
  stripeWebhook.includes("webhook") &&
  !stripeWebhook.includes("admin-mobile")
) {
  pass("stripe_webhook_unchanged");
} else {
  fail("stripe_webhook_unchanged");
}

// 17. Phase 6.8 auth callback unchanged
if (
  registerPage.includes("emailRedirectTo") &&
  authCallback.includes("exchangeCodeForSession") &&
  authCallback.includes('router.replace("/account")')
) {
  pass("phase68_auth_unchanged");
} else {
  fail("phase68_auth_unchanged");
}

// 18. Customer checkout logic unchanged (stripe checkout route still intact)
const checkoutSession = read("app/api/checkout/create-session/route.ts");
if (
  checkoutSession.includes("getStripe") &&
  checkoutSession.includes("export async function POST") &&
  !checkoutSession.includes("phase69")
) {
  pass("checkout_logic_unchanged");
} else {
  fail("checkout_logic_unchanged");
}

// Extra: product create mobile sticky actions
if (productNew.includes("fixed inset-x-0 bottom-0") && productNew.includes("min-h-11")) {
  pass("product_create_mobile_actions");
} else {
  fail("product_create_mobile_actions");
}

// Extra: AdminShell overflow containment
if (adminShell.includes("overflow-x-hidden")) {
  pass("admin_shell_overflow_contained");
} else {
  fail("admin_shell_overflow_contained");
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\nPhase 6.9 admin-mobile: ${results.length - failed.length}/${results.length} passed`
);
if (failed.length) process.exit(1);
