/**
 * Phase 6.10 — storefront UI redesign regression tests.
 * Run: node scripts/_phase610-storefront-ui.mjs
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";

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

const homePage = read("app/page.tsx");
const productCard = read("components/ProductCard.tsx");
const productsPage = read("app/products/page.tsx");
const productsClient = read("components/ProductsClient.tsx");
const productDetail = read("app/product/[slug]/page.tsx");
const navbar = read("components/Navbar.tsx");
const globals = read("app/globals.css");
const registerPage = read("app/register/page.tsx");
const authCallback = read("app/auth/callback/page.tsx");
const stripeWebhook = read("app/api/stripe/webhook/route.ts");
const checkoutApi = read("app/api/checkout/create-session/route.ts");
const manualFulfill = read("app/api/admin/orders/manual-fulfill/route.ts");
const deliverEmail = read("app/api/admin/inventory/deliver-email/route.ts");

// 1. Four-image hero section is removed
if (
  !existsSync("components/HeroVisual.tsx") &&
  !homePage.includes("HeroVisual") &&
  !homePage.includes("hero-visual")
) {
  pass("four_image_hero_removed");
} else {
  fail("four_image_hero_removed");
}

// 2. Homepage still renders product sections
if (
  homePage.includes("ProductSection") &&
  homePage.includes("GameCategoryCard") &&
  homePage.includes("fetchProductStockCountMap")
) {
  pass("homepage_product_sections");
} else {
  fail("homepage_product_sections");
}

// 3. ProductCard remains wired to product data
if (
  productCard.includes("product.title") &&
  productCard.includes("product.cover_image_url") &&
  productCard.includes("formatPrice")
) {
  pass("product_card_data_wiring");
} else {
  fail("product_card_data_wiring");
}

// 4. ProductCard uses stock information
if (
  productCard.includes("customerStockLabel") &&
  productCard.includes("availableStock") &&
  productCard.includes("stockLevelFromAvailable")
) {
  pass("product_card_stock");
} else {
  fail("product_card_stock");
}

// 5. Products page remains wired to ProductsClient
if (
  productsPage.includes("ProductsClient") &&
  productsPage.includes("fetchProductStockCountMap") &&
  productsPage.includes("generateMetadata")
) {
  pass("products_page_wiring");
} else {
  fail("products_page_wiring");
}

// 6. Product detail page remains functional
if (
  productDetail.includes("ProductGallery") &&
  productDetail.includes("PurchaseButtons") &&
  productDetail.includes("buildProductJsonLd") &&
  productDetail.includes("fetchSellableStockCount")
) {
  pass("product_detail_functional");
} else {
  fail("product_detail_functional");
}

// 7. Existing Buy/Checkout action remains present
if (
  productDetail.includes("PurchaseButtons") &&
  productDetail.includes("ProductPurchaseBar") &&
  productsClient.includes("ProductCard")
) {
  pass("checkout_actions_present");
} else {
  fail("checkout_actions_present");
}

// 8. Navbar remains present
if (navbar.includes("SITE_NAME") && navbar.includes("/products")) {
  pass("navbar_present");
} else {
  fail("navbar_present");
}

// 9. Mobile responsive classes exist
if (
  navbar.includes("lg:hidden") &&
  navbar.includes("min-h-11") &&
  productCard.includes("line-clamp-2") &&
  productsClient.includes("lg:grid-cols")
) {
  pass("mobile_responsive_classes");
} else {
  fail("mobile_responsive_classes");
}

// 10. No products.stock introduced
const uiFiles = [homePage, productCard, productsClient, productDetail];
if (!uiFiles.some((f) => /products\.stock|product\.stock/.test(f))) {
  pass("no_products_stock_field");
} else {
  fail("no_products_stock_field");
}

// 11. No database migration created
let migrationAdded = false;
try {
  migrationAdded = readdirSync("supabase/migrations").some((name) =>
    /phase.?6.?10|storefront.?ui/i.test(name)
  );
} catch {
  // ok
}
if (!migrationAdded) pass("no_db_migration");
else fail("no_db_migration");

// 12. No Stripe files modified (still contains webhook handler)
if (stripeWebhook.includes("POST") && !stripeWebhook.includes("phase610")) {
  pass("stripe_webhook_unchanged");
} else {
  fail("stripe_webhook_unchanged");
}

// 13. No checkout API modified
if (
  checkoutApi.includes("getStripe") &&
  checkoutApi.includes("export async function POST") &&
  !checkoutApi.includes("phase610")
) {
  pass("checkout_api_unchanged");
} else {
  fail("checkout_api_unchanged");
}

// 14. No inventory assignment files modified in this phase
const assignFile = read("lib/inventory-assign.ts");
if (assignFile.includes("assign") && !assignFile.includes("phase610")) {
  pass("inventory_assign_unchanged");
} else {
  fail("inventory_assign_unchanged");
}

// 15. No email files modified
if (
  deliverEmail.includes("deliver-email") &&
  !deliverEmail.includes("phase610")
) {
  pass("email_delivery_unchanged");
} else {
  fail("email_delivery_unchanged");
}

// 16. No auth files modified
if (
  registerPage.includes("emailRedirectTo") &&
  authCallback.includes("exchangeCodeForSession") &&
  !registerPage.includes("phase610")
) {
  pass("auth_unchanged");
} else {
  fail("auth_unchanged");
}

// 17. Existing stock helper remains used
if (
  homePage.includes("@/lib/catalog-stock-server") &&
  productCard.includes("@/lib/inventory-stock")
) {
  pass("stock_helper_used");
} else {
  fail("stock_helper_used");
}

// 18. Existing product filtering remains functional
if (
  productsClient.includes("buildProductListHref") &&
  productsClient.includes("navigateFilters") &&
  productsPage.includes("fetchFilteredProducts")
) {
  pass("product_filtering_intact");
} else {
  fail("product_filtering_intact");
}

// 19. Existing SEO metadata remains intact
if (
  productsPage.includes("generateMetadata") &&
  productDetail.includes("buildProductJsonLd") &&
  productDetail.includes("buildBreadcrumbJsonLd")
) {
  pass("seo_metadata_intact");
} else {
  fail("seo_metadata_intact");
}

// 20. Phase 6.8 auth callback remains untouched
if (
  authCallback.includes('router.replace("/account")') &&
  authCallback.includes("Invalid confirmation link")
) {
  pass("phase68_callback_intact");
} else {
  fail("phase68_callback_intact");
}

// Extra: new compact hero
if (
  homePage.includes("Trusted Game Account Store") &&
  homePage.includes("hero-compact") &&
  homePage.includes("Browse Accounts")
) {
  pass("compact_typography_hero");
} else {
  fail("compact_typography_hero");
}

// Extra: lighter color system
if (globals.includes("--surface-card") && globals.includes("#0f172a")) {
  pass("lighter_color_system");
} else {
  fail("lighter_color_system");
}

// Extra: manual fulfill unchanged
if (manualFulfill.includes("manualFulfillOrderByEmail")) {
  pass("manual_fulfill_unchanged");
} else {
  fail("manual_fulfill_unchanged");
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\nPhase 6.10 storefront-ui: ${results.length - failed.length}/${results.length} passed`
);
if (failed.length) process.exit(1);
