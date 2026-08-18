/**
 * Phase 18 — homepage redesign + product_type storefront filter.
 * Run: node --import tsx scripts/_phase18-homepage.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const {
  parseStorefrontProductTypeFilter,
  storefrontProductTypeHref,
  isAccountProductType,
  isWhatsAppOnlyProductType,
  isStripeCheckoutAllowed,
} = await import("../lib/product-type.ts");

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

const homePage = read("app/page.tsx");
const categoryCards = read("components/HomeCategoryCards.tsx");
const productsPage = read("app/products/page.tsx");
const productsClient = read("components/ProductsClient.tsx");
const catalog = read("lib/catalog-server.ts");
const checkoutApi = read("app/api/checkout/create-session/route.ts");
const purchaseButtons = read("components/PurchaseButtons.tsx");
const productCard = read("components/ProductCard.tsx");
const webhook = read("app/api/stripe/webhook/route.ts");
const zinkgameImport = read("lib/supplier/import.ts");
const adminNew = read("app/admin/products/new/page.tsx");

assert.equal(parseStorefrontProductTypeFilter("ENDGAME_ACCOUNT"), "ENDGAME_ACCOUNT");
assert.equal(parseStorefrontProductTypeFilter("REROLL_ACCOUNT"), "REROLL_ACCOUNT");
assert.equal(parseStorefrontProductTypeFilter("TOP_UP"), "TOP_UP");
assert.equal(parseStorefrontProductTypeFilter(""), "");
assert.equal(parseStorefrontProductTypeFilter("nope"), "");
assert.equal(storefrontProductTypeHref("TOP_UP"), "/products?type=TOP_UP");
pass("product_type_query_parser");

if (
  catalog.includes("includeProductTypeFilter") &&
  catalog.includes('next.eq("product_type", productType)') &&
  productsPage.includes("typeFilter") &&
  productsClient.includes('params.set("type", nextType)')
) {
  pass("products_list_type_filter_wired");
} else {
  fail("products_list_type_filter_wired");
}

if (
  homePage.includes("HomeCategoryCards") &&
  categoryCards.includes("Browse Endgame Accounts") &&
  categoryCards.includes("Browse Reroll Accounts") &&
  categoryCards.includes("Top Up Now") &&
  categoryCards.includes("storefrontProductTypeHref")
) {
  pass("homepage_three_category_cards");
} else {
  fail("homepage_three_category_cards");
}

if (
  homePage.includes("Browse Accounts") &&
  homePage.includes("Find an Account") &&
  homePage.includes("Popular Games") &&
  homePage.includes("Featured accounts") &&
  homePage.includes("Recently Sold") &&
  homePage.includes("Find Me an Account") &&
  !homePage.includes("How to buy") &&
  !homePage.includes("FAQ")
) {
  pass("homepage_structure");
} else {
  fail("homepage_structure");
}

if (
  homePage.includes("isAccountProductType") &&
  homePage.includes("getRecommendedProducts(accountProducts)")
) {
  pass("featured_accounts_exclude_top_up");
} else {
  fail("featured_accounts_exclude_top_up");
}

const endgameBadges = getProductBadges(
  {
    id: "1",
    title: "AR60",
    slug: "ar60",
    description: null,
    price: 100,
    currency: "MYR",
    status: "available",
    server: null,
    ar_level: 60,
    cover_image_url: null,
    game_id: null,
    product_type: "ENDGAME_ACCOUNT",
  },
  1,
  false
);
assert.ok(endgameBadges.includes("ENDGAME"));
assert.ok(!endgameBadges.includes("TOP_UP"));
assert.ok(productCard.includes("Endgame Account"));
assert.ok(productCard.includes("Reroll Account"));
assert.ok(productCard.includes("Top Up"));
pass("product_card_type_badges");

assert.equal(isStripeCheckoutAllowed("ENDGAME_ACCOUNT"), true);
assert.equal(isStripeCheckoutAllowed("REROLL_ACCOUNT"), true);
assert.equal(isStripeCheckoutAllowed("TOP_UP"), false);
assert.equal(isWhatsAppOnlyProductType("TOP_UP"), true);
assert.equal(isAccountProductType("TOP_UP"), false);
if (
  checkoutApi.includes("isStripeCheckoutAllowed") &&
  purchaseButtons.includes("whatsappOnly") &&
  purchaseButtons.includes("buildTopUpWhatsAppMessage")
) {
  pass("top_up_remains_whatsapp_only");
} else {
  fail("top_up_remains_whatsapp_only");
}

if (
  webhook.includes("assignInventoryAfterPayment") &&
  checkoutApi.includes("fetchProductStockSummary") &&
  !homePage.includes("create-session")
) {
  pass("stripe_account_checkout_untouched_on_homepage");
} else {
  fail("stripe_account_checkout_untouched_on_homepage");
}

if (
  !zinkgameImport.includes("HomeCategoryCards") &&
  adminNew.includes("ADMIN_CREATABLE_PRODUCT_TYPES")
) {
  pass("admin_and_supplier_not_redesigned");
} else {
  fail("admin_and_supplier_not_redesigned");
}

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(`Phase 18: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  process.exitCode = 1;
}
