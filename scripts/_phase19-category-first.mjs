/**
 * Phase 19 — category-first storefront (homepage types + type-aware game picker).
 * Run: node --import tsx scripts/_phase19-category-first.mjs
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const {
  parseStorefrontProductTypeFilter,
  storefrontProductTypeHref,
  storefrontCatalogHref,
  isAccountProductType,
  isWhatsAppOnlyProductType,
  isStripeCheckoutAllowed,
} = await import("../lib/product-type.ts");

const { productsHasActiveFilters } = await import("../lib/seo.ts");

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
const productsPage = read("app/products/page.tsx");
const productsClient = read("components/ProductsClient.tsx");
const catalog = read("lib/catalog-server.ts");
const gameCard = read("components/GameCategoryCard.tsx");
const productCard = read("components/ProductCard.tsx");
const checkoutApi = read("app/api/checkout/create-session/route.ts");
const webhook = read("app/api/stripe/webhook/route.ts");
const purchaseButtons = read("components/PurchaseButtons.tsx");
const adminNew = read("app/admin/products/new/page.tsx");
const zinkgameImport = read("lib/supplier/import.ts");
const globals = read("app/globals.css");
const seo = read("lib/seo.ts");

const TYPE_SECTIONS = [
  "ENDGAME_ACCOUNT",
  "REROLL_ACCOUNT",
  "TOP_UP",
];

// 1. Homepage has exactly three primary product sections
const typeSectionCount = (homePage.match(/TYPE_SECTIONS\.map/g) || []).length;
const hasEndgameHeading = homePage.includes("Endgame Accounts");
const hasRerollHeading = homePage.includes("Reroll Accounts");
const hasTopUpHeading = homePage.includes("Game Top Up");
if (
  typeSectionCount === 1 &&
  hasEndgameHeading &&
  hasRerollHeading &&
  hasTopUpHeading &&
  !homePage.includes("HomeCategoryCards") &&
  !homePage.includes("Featured accounts") &&
  !existsSync("components/HomeCategoryCards.tsx")
) {
  pass("homepage_three_primary_product_sections");
} else {
  fail("homepage_three_primary_product_sections");
}

// 2. Each section shows max 3 products
if (
  homePage.includes("HOME_TYPE_LIMIT = 3") &&
  homePage.includes(".slice(0, HOME_TYPE_LIMIT)")
) {
  pass("homepage_sections_max_three_products");
} else {
  fail("homepage_sections_max_three_products");
}

// 3–5. Each typed section filters a single product_type from available products
function sectionFiltersType(type) {
  return (
    homePage.includes(`type: "${type}"`) &&
    homePage.includes("normalizeProductType(product.product_type) === type") &&
    homePage.includes('product.status === "available"')
  );
}

if (sectionFiltersType("ENDGAME_ACCOUNT")) {
  pass("endgame_section_only_endgame_account");
} else {
  fail("endgame_section_only_endgame_account");
}

if (sectionFiltersType("REROLL_ACCOUNT")) {
  pass("reroll_section_only_reroll_account");
} else {
  fail("reroll_section_only_reroll_account");
}

if (sectionFiltersType("TOP_UP")) {
  pass("top_up_section_only_top_up");
} else {
  fail("top_up_section_only_top_up");
}

// 6. Top Up remains WhatsApp-only
assert.equal(isStripeCheckoutAllowed("TOP_UP"), false);
assert.equal(isWhatsAppOnlyProductType("TOP_UP"), true);
assert.equal(isAccountProductType("TOP_UP"), false);
if (
  checkoutApi.includes("isStripeCheckoutAllowed") &&
  purchaseButtons.includes("whatsappOnly") &&
  purchaseButtons.includes("buildTopUpWhatsAppMessage") &&
  productCard.includes("isWhatsAppOnlyProductType") &&
  !productCard.includes("N Accounts Available")
) {
  pass("top_up_remains_whatsapp_only");
} else {
  fail("top_up_remains_whatsapp_only");
}

// 7–9. View-all links use existing product type query
assert.equal(
  storefrontProductTypeHref("ENDGAME_ACCOUNT"),
  "/products?type=ENDGAME_ACCOUNT"
);
assert.equal(
  storefrontProductTypeHref("REROLL_ACCOUNT"),
  "/products?type=REROLL_ACCOUNT"
);
assert.equal(storefrontProductTypeHref("TOP_UP"), "/products?type=TOP_UP");

if (
  homePage.includes("View All Endgame Accounts") &&
  homePage.includes("storefrontProductTypeHref(section.type)") &&
  homePage.includes("View All Reroll Accounts") &&
  homePage.includes("View All Top Up")
) {
  pass("endgame_view_all_type_href");
  pass("reroll_view_all_type_href");
  pass("top_up_view_all_type_href");
} else {
  fail("endgame_view_all_type_href");
  fail("reroll_view_all_type_href");
  fail("top_up_view_all_type_href");
}

// 10–12. Game + type URLs reuse existing slug + product_type filters
assert.equal(
  storefrontCatalogHref({
    type: "ENDGAME_ACCOUNT",
    game: "genshin-impact",
  }),
  "/products?type=ENDGAME_ACCOUNT&game=genshin-impact"
);
assert.equal(
  storefrontCatalogHref({
    type: "REROLL_ACCOUNT",
    game: "genshin-impact",
  }),
  "/products?type=REROLL_ACCOUNT&game=genshin-impact"
);
assert.equal(
  storefrontCatalogHref({
    type: "TOP_UP",
    game: "genshin-impact",
  }),
  "/products?type=TOP_UP&game=genshin-impact"
);
assert.equal(parseStorefrontProductTypeFilter("ENDGAME_ACCOUNT"), "ENDGAME_ACCOUNT");

if (
  catalog.includes('next.eq("game_id", matchedGame.id)') &&
  catalog.includes('next.eq("product_type", productType)') &&
  productsPage.includes("type: typeFilter || undefined") &&
  productsPage.includes("game: gameSlug") &&
  productsClient.includes("storefrontCatalogHref") &&
  productsClient.includes("game: game.slug")
) {
  pass("genshin_endgame_uses_type_and_game_filters");
  pass("genshin_reroll_uses_type_and_game_filters");
  pass("genshin_top_up_uses_type_and_game_filters");
} else {
  fail("genshin_endgame_uses_type_and_game_filters");
  fail("genshin_reroll_uses_type_and_game_filters");
  fail("genshin_top_up_uses_type_and_game_filters");
}

// 13. Games with no listings for the selected type are omitted
if (
  catalog.includes("export function gamesWithAvailableListings") &&
  catalog.includes("buildListingCountsByGame") &&
  catalog.includes('(counts[game.id] || 0) > 0') &&
  productsPage.includes("gamesWithAvailableListings(games, typeAvailableProducts)") &&
  productsClient.includes("games={selectorGames}") &&
  productsClient.includes("typeFilter") &&
  productsClient.includes("typeScopedGames")
) {
  pass("games_without_type_listings_hidden");
} else {
  fail("games_without_type_listings_hidden");
}

// 14. Account checkout unchanged
if (
  checkoutApi.includes("isStripeCheckoutAllowed") &&
  checkoutApi.includes("fetchProductStockSummary") &&
  webhook.includes("assignInventoryAfterPayment") &&
  webhook.includes("deliverInventoryByEmail") &&
  isStripeCheckoutAllowed("ENDGAME_ACCOUNT") &&
  isStripeCheckoutAllowed("REROLL_ACCOUNT")
) {
  pass("account_checkout_unchanged");
} else {
  fail("account_checkout_unchanged");
}

// 15. Admin / supplier / schema untouched by this phase
if (
  adminNew.includes("ADMIN_CREATABLE_PRODUCT_TYPES") &&
  !zinkgameImport.includes("storefrontCatalogHref") &&
  !zinkgameImport.includes("HomeCategoryCards") &&
  !existsSync("supabase/phase19_category_first.sql")
) {
  pass("admin_supplier_schema_untouched");
} else {
  fail("admin_supplier_schema_untouched");
}

// Bonus: compact hero + SEO noindex for type/game filters
if (
  globals.includes(".hero-compact") &&
  globals.includes("min-height: 0") &&
  homePage.includes("hero-compact") &&
  homePage.includes("Browse Accounts") &&
  homePage.includes("Find an Account")
) {
  pass("hero_compact");
} else {
  fail("hero_compact");
}

assert.equal(
  productsHasActiveFilters({ type: "ENDGAME_ACCOUNT" }),
  true
);
assert.equal(
  productsHasActiveFilters({ type: "TOP_UP", game: "genshin-impact" }),
  true
);
assert.equal(productsHasActiveFilters({}), false);
if (seo.includes("params.type?.trim()") && seo.includes("params.game?.trim()")) {
  pass("filtered_catalog_remains_noindex");
} else {
  fail("filtered_catalog_remains_noindex");
}

if (
  gameCard.includes("countLabel") &&
  productsClient.includes('? "1 listing"') &&
  productsClient.includes("View top up")
) {
  pass("type_scoped_game_cards_avoid_account_stock_copy");
} else {
  fail("type_scoped_game_cards_avoid_account_stock_copy");
}

for (const type of TYPE_SECTIONS) {
  assert.ok(homePage.includes(`type: "${type}"`));
}

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(`Phase 19: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  process.exitCode = 1;
}
