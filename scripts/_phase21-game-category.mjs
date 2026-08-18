/**
 * Phase 21 — game category experience (type → game → products).
 * Run: node --import tsx scripts/_phase21-game-category.mjs
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const {
  parseStorefrontProductTypeFilter,
  parseStorefrontGameSlug,
  storefrontCatalogHref,
  storefrontProductTypeHref,
  catalogTypeLandingPrompt,
  catalogNoGamesForTypeMessage,
  catalogNoListingsForGameMessage,
  isWhatsAppOnlyProductType,
  isStripeCheckoutAllowed,
} = await import("../lib/product-type.ts");

const {
  gamesWithAvailableListings,
  filterAvailableProductsByTypeAndGame,
  typesWithAvailableListings,
} = await import("../lib/catalog-filters.ts");

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

const productsPage = read("app/products/page.tsx");
const productsClient = read("components/ProductsClient.tsx");
const catalog = read("lib/catalog-server.ts");
const catalogFilters = read("lib/catalog-filters.ts");
const checkoutApi = read("app/api/checkout/create-session/route.ts");
const purchaseButtons = read("components/PurchaseButtons.tsx");
const homePage = read("app/page.tsx");
const adminNew = read("app/admin/products/new/page.tsx");
const zinkgameImport = read("lib/supplier/import.ts");
const seo = read("lib/seo.ts");

const genshin = {
  id: "game-genshin",
  name: "Genshin Impact",
  slug: "genshin-impact",
  description: null,
  image_url: null,
  logo_url: null,
  banner_url: null,
  mobile_banner_url: null,
};
const wuwa = {
  id: "game-wuwa",
  name: "Wuthering Waves",
  slug: "wuthering-waves",
  description: null,
  image_url: null,
  logo_url: null,
  banner_url: null,
  mobile_banner_url: null,
};
const hsr = {
  id: "game-hsr",
  name: "Honkai: Star Rail",
  slug: "honkai-star-rail",
  description: null,
  image_url: null,
  logo_url: null,
  banner_url: null,
  mobile_banner_url: null,
};

const catalogProducts = [
  {
    id: "p1",
    status: "available",
    product_type: "ENDGAME_ACCOUNT",
    game_id: genshin.id,
  },
  {
    id: "p2",
    status: "available",
    product_type: "ENDGAME_ACCOUNT",
    game_id: wuwa.id,
  },
  {
    id: "p3",
    status: "sold",
    product_type: "ENDGAME_ACCOUNT",
    game_id: hsr.id,
  },
  {
    id: "p4",
    status: "available",
    product_type: "REROLL_ACCOUNT",
    game_id: genshin.id,
  },
  {
    id: "p5",
    status: "available",
    product_type: "TOP_UP",
    game_id: genshin.id,
  },
  {
    id: "p6",
    status: "available",
    product_type: "REROLL_ACCOUNT",
    game_id: wuwa.id,
  },
];

try {
  assert.equal(parseStorefrontProductTypeFilter("ENDGAME_ACCOUNT"), "ENDGAME_ACCOUNT");
  pass("endgame_type_parsing");
} catch (error) {
  fail("endgame_type_parsing", error.message);
}

try {
  assert.equal(parseStorefrontProductTypeFilter("REROLL_ACCOUNT"), "REROLL_ACCOUNT");
  pass("reroll_type_parsing");
} catch (error) {
  fail("reroll_type_parsing", error.message);
}

try {
  assert.equal(parseStorefrontProductTypeFilter("TOP_UP"), "TOP_UP");
  pass("top_up_type_parsing");
} catch (error) {
  fail("top_up_type_parsing", error.message);
}

try {
  assert.equal(parseStorefrontGameSlug("genshin-impact"), "genshin-impact");
  assert.equal(parseStorefrontGameSlug("  genshin-impact  "), "genshin-impact");
  assert.equal(parseStorefrontGameSlug(""), "");
  assert.equal(parseStorefrontGameSlug(undefined), "");
  pass("game_parameter_parsing");
} catch (error) {
  fail("game_parameter_parsing", error.message);
}

try {
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
  pass("type_and_game_combination");
} catch (error) {
  fail("type_and_game_combination", error.message);
}

try {
  const availableEndgame = catalogProducts.filter(
    (product) =>
      product.status === "available" && product.product_type === "ENDGAME_ACCOUNT"
  );
  const games = gamesWithAvailableListings(
    [genshin, wuwa, hsr],
    availableEndgame
  );
  assert.equal(games.some((entry) => entry.game.id === hsr.id), false);
  assert.ok(games.every((entry) => entry.listingCount > 0));
  assert.equal(
    catalogFilters.includes('product.status !== "available"'),
    true
  );
  pass("available_only_filtering");
} catch (error) {
  fail("available_only_filtering", error.message);
}

try {
  const availableEndgame = catalogProducts.filter(
    (product) =>
      product.status === "available" && product.product_type === "ENDGAME_ACCOUNT"
  );
  const games = gamesWithAvailableListings(
    [genshin, wuwa, hsr],
    availableEndgame
  );
  assert.deepEqual(
    games.map((entry) => entry.game.slug),
    ["genshin-impact", "wuthering-waves"]
  );
  pass("games_with_zero_products_excluded");
} catch (error) {
  fail("games_with_zero_products_excluded", error.message);
}

try {
  assert.equal(
    storefrontProductTypeHref("ENDGAME_ACCOUNT"),
    "/products?type=ENDGAME_ACCOUNT"
  );
  assert.equal(
    storefrontCatalogHref({ type: "ENDGAME_ACCOUNT" }),
    "/products?type=ENDGAME_ACCOUNT"
  );
  assert.equal(
    storefrontCatalogHref({ game: "genshin-impact" }),
    "/products?game=genshin-impact"
  );
  pass("correct_url_generation");
} catch (error) {
  fail("correct_url_generation", error.message);
}

try {
  const matched = filterAvailableProductsByTypeAndGame(catalogProducts, {
    type: "ENDGAME_ACCOUNT",
    gameId: genshin.id,
  });
  assert.equal(matched.length, 1);
  assert.equal(matched[0].id, "p1");
  assert.ok(
    matched.every(
      (product) =>
        product.product_type === "ENDGAME_ACCOUNT" &&
        product.game_id === genshin.id &&
        product.status === "available"
    )
  );
  pass("endgame_genshin_only_endgame_genshin");
} catch (error) {
  fail("endgame_genshin_only_endgame_genshin", error.message);
}

try {
  const matched = filterAvailableProductsByTypeAndGame(catalogProducts, {
    type: "REROLL_ACCOUNT",
    gameId: genshin.id,
  });
  assert.equal(matched.length, 1);
  assert.equal(matched[0].id, "p4");
  pass("reroll_genshin_only_reroll_genshin");
} catch (error) {
  fail("reroll_genshin_only_reroll_genshin", error.message);
}

try {
  const matched = filterAvailableProductsByTypeAndGame(catalogProducts, {
    type: "TOP_UP",
    gameId: genshin.id,
  });
  assert.equal(matched.length, 1);
  assert.equal(matched[0].id, "p5");
  pass("top_up_genshin_only_top_up_genshin");
} catch (error) {
  fail("top_up_genshin_only_top_up_genshin", error.message);
}

try {
  assert.equal(isWhatsAppOnlyProductType("TOP_UP"), true);
  assert.equal(isStripeCheckoutAllowed("TOP_UP"), false);
  assert.equal(isStripeCheckoutAllowed("ENDGAME_ACCOUNT"), true);
  if (
    checkoutApi.includes("isStripeCheckoutAllowed") &&
    purchaseButtons.includes("whatsappOnly") &&
    purchaseButtons.includes("buildTopUpWhatsAppMessage")
  ) {
    pass("top_up_remains_whatsapp_only");
  } else {
    fail("top_up_remains_whatsapp_only");
  }
} catch (error) {
  fail("top_up_remains_whatsapp_only", error.message);
}

try {
  assert.equal(
    catalogNoGamesForTypeMessage("TOP_UP"),
    "No top up listings are available yet."
  );
  assert.equal(
    catalogNoListingsForGameMessage("ENDGAME_ACCOUNT", "Genshin Impact"),
    "No Endgame Accounts are currently available for Genshin Impact."
  );
  if (
    productsClient.includes("catalogNoGamesForTypeMessage") &&
    productsClient.includes("catalogNoListingsForGameMessage") &&
    productsClient.includes("Browse other games") &&
    productsClient.includes("Contact us on WhatsApp")
  ) {
    pass("empty_state_exists");
  } else {
    fail("empty_state_exists");
  }
} catch (error) {
  fail("empty_state_exists", error.message);
}

try {
  assert.equal(
    storefrontCatalogHref({
      type: "REROLL_ACCOUNT",
      game: "genshin-impact",
    }),
    "/products?type=REROLL_ACCOUNT&game=genshin-impact"
  );
  if (
    productsClient.includes("CATALOG_TYPE_NAV") &&
    productsClient.includes("game: gameSlug || undefined") &&
    catalogTypeLandingPrompt("ENDGAME_ACCOUNT").includes("Choose a game")
  ) {
    pass("product_type_switch_preserves_game");
  } else {
    fail("product_type_switch_preserves_game");
  }
} catch (error) {
  fail("product_type_switch_preserves_game", error.message);
}

try {
  if (
    !existsSync("supabase/phase21_game_category.sql") &&
    !zinkgameImport.includes("storefrontCatalogHref") &&
    !zinkgameImport.includes("typesWithAvailableListings") &&
    adminNew.includes("ADMIN_CREATABLE_PRODUCT_TYPES") &&
    homePage.includes("storefrontProductTypeHref") &&
    productsPage.includes("parseStorefrontGameSlug") &&
    productsPage.includes("gamesWithAvailableListings") &&
    seo.includes("params.type?.trim()") &&
    seo.includes("params.game?.trim()") &&
    catalog.includes('next.eq("game_id", matchedGame.id)') &&
    catalog.includes('next.eq("product_type", productType)') &&
    catalogFilters.includes("filterAvailableProductsByTypeAndGame")
  ) {
    pass("no_schema_changes");
  } else {
    fail("no_schema_changes");
  }
} catch (error) {
  fail("no_schema_changes", error.message);
}

try {
  const types = typesWithAvailableListings(catalogProducts);
  assert.ok(types.every((entry) => entry.listingCount > 0));
  assert.equal(
    types.find((entry) => entry.type === "ENDGAME_ACCOUNT")?.listingCount,
    2
  );
  pass("type_counts_ignore_sold_and_empty");
} catch (error) {
  fail("type_counts_ignore_sold_and_empty", error.message);
}

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(`Phase 21: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  process.exitCode = 1;
}
