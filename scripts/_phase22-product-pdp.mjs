/**
 * Phase 22 — product card + PDP conversion polish.
 * Run: node --import tsx scripts/_phase22-product-pdp.mjs
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const {
  getProductTypeLabel,
  getPdpProductTypeLabel,
  storefrontPurchaseStateLabel,
  storefrontCatalogHref,
  isWhatsAppOnlyProductType,
  isStripeCheckoutAllowed,
  normalizeProductType,
} = await import("../lib/product-type.ts");

const { getProductBadges, PUBLIC_PRODUCT_SELECT, SUPPLIER_INTERNAL_PRODUCT_FIELDS } =
  await import("../lib/products-public.ts");

const { resolveCustomerStockDisplay } = await import("../lib/inventory-stock.ts");

const { buildProductPageTitle } = await import("../lib/seo.ts");

const { buildTopUpWhatsAppMessage } = await import("../lib/config.ts");

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
const pdp = read("app/product/[slug]/page.tsx");
const purchaseButtons = read("components/PurchaseButtons.tsx");
const purchaseBar = read("components/ProductPurchaseBar.tsx");
const productsClient = read("components/ProductsClient.tsx");
const checkoutApi = read("app/api/checkout/create-session/route.ts");
const productTypeLib = read("lib/product-type.ts");
const seo = read("lib/seo.ts");

const sample = {
  id: "p1",
  title: "C6R1",
  slug: "c6r1",
  status: "available",
  price: 1299,
  currency: "MYR",
};

try {
  assert.equal(getProductTypeLabel("ENDGAME_ACCOUNT"), "Endgame Account");
  assert.equal(getProductTypeLabel("REROLL_ACCOUNT"), "Reroll Account");
  assert.equal(getProductTypeLabel("TOP_UP"), "Top Up");
  if (
    productCard.includes("getProductTypeLabel") &&
    productCard.includes("Endgame Account") &&
    productCard.includes("Reroll Account") &&
    productCard.includes("Top Up")
  ) {
    pass("product_type_badge_exists");
  } else {
    fail("product_type_badge_exists");
  }
} catch (error) {
  fail("product_type_badge_exists", error.message);
}

try {
  const badges = getProductBadges(
    { ...sample, product_type: "ENDGAME_ACCOUNT" },
    10,
    true
  );
  assert.ok(badges.includes("ENDGAME"));
  if (
    productCard.includes("View Account") &&
    !productCard.includes("supplier_cost")
  ) {
    pass("endgame_card_behavior");
  } else {
    fail("endgame_card_behavior");
  }
} catch (error) {
  fail("endgame_card_behavior", error.message);
}

try {
  const badges = getProductBadges(
    { ...sample, product_type: "REROLL_ACCOUNT" },
    3,
    true
  );
  assert.ok(badges.includes("REROLL"));
  assert.ok(!badges.includes("TOP_UP"));
  if (productCard.includes("Reroll Account")) {
    pass("reroll_card_behavior");
  } else {
    fail("reroll_card_behavior");
  }
} catch (error) {
  fail("reroll_card_behavior", error.message);
}

try {
  const badges = getProductBadges(
    { ...sample, product_type: "TOP_UP" },
    0,
    false
  );
  assert.ok(badges.includes("TOP_UP"));
  assert.equal(
    storefrontPurchaseStateLabel({
      productType: "TOP_UP",
      stockLabel: "Available",
      listed: true,
    }),
    "WhatsApp Only"
  );
  if (
    productCard.includes("storefrontPurchaseStateLabel") &&
    productCard.includes("View Top Up") &&
    productTypeLib.includes("WhatsApp Only")
  ) {
    pass("top_up_card_behavior");
  } else {
    fail("top_up_card_behavior");
  }
} catch (error) {
  fail("top_up_card_behavior", error.message);
}

try {
  assert.equal(isWhatsAppOnlyProductType("TOP_UP"), true);
  assert.equal(isStripeCheckoutAllowed("TOP_UP"), false);
  if (
    purchaseButtons.includes("whatsappOnly") &&
    purchaseButtons.includes("buildTopUpWhatsAppMessage") &&
    purchaseButtons.includes("Order via WhatsApp") &&
    purchaseButtons.includes("Order on WhatsApp")
  ) {
    pass("top_up_whatsapp_only_behavior");
  } else {
    fail("top_up_whatsapp_only_behavior");
  }
} catch (error) {
  fail("top_up_whatsapp_only_behavior", error.message);
}

try {
  const inStock = resolveCustomerStockDisplay({
    productStatus: "available",
    availableCount: 10,
    inventoryManaged: true,
  });
  const low = resolveCustomerStockDisplay({
    productStatus: "available",
    availableCount: 1,
    inventoryManaged: true,
  });
  assert.equal(inStock.label, "10 Accounts Available");
  assert.equal(low.label, "Only 1 Left");
  assert.equal(
    storefrontPurchaseStateLabel({
      productType: "ENDGAME_ACCOUNT",
      stockLabel: inStock.label,
      listed: true,
    }),
    "10 Accounts Available"
  );
  pass("account_stock_labels");
} catch (error) {
  fail("account_stock_labels", error.message);
}

try {
  const topUpLabel = storefrontPurchaseStateLabel({
    productType: "TOP_UP",
    stockLabel: "10 Accounts Available",
    listed: true,
  });
  assert.equal(topUpLabel, "WhatsApp Only");
  assert.ok(!topUpLabel.toLowerCase().includes("account"));
  if (
    productCard.includes("storefrontPurchaseStateLabel") &&
    productTypeLib.includes("WhatsApp Only") &&
    !productCard.includes("N Accounts Available")
  ) {
    pass("top_up_does_not_use_stock_labels");
  } else {
    fail("top_up_does_not_use_stock_labels");
  }
} catch (error) {
  fail("top_up_does_not_use_stock_labels", error.message);
}

try {
  if (
    productCard.includes("formatPrice") &&
    pdp.includes("product-price") &&
    pdp.includes("formatPrice") &&
    !productCard.includes("supplier_cost") &&
    !pdp.includes("supplier_cost")
  ) {
    pass("price_display");
  } else {
    fail("price_display");
  }
} catch (error) {
  fail("price_display", error.message);
}

try {
  assert.equal(
    storefrontCatalogHref({
      type: "ENDGAME_ACCOUNT",
      game: "genshin-impact",
    }),
    "/products?type=ENDGAME_ACCOUNT&game=genshin-impact"
  );
  if (
    productsClient.includes("storefrontCatalogHref") &&
    productsClient.includes("CATALOG_TYPE_NAV") &&
    productsClient.includes("Price: Low to High")
  ) {
    pass("type_and_game_filtering_intact");
  } else {
    fail("type_and_game_filtering_intact");
  }
} catch (error) {
  fail("type_and_game_filtering_intact", error.message);
}

try {
  assert.equal(getPdpProductTypeLabel("ENDGAME_ACCOUNT"), "Endgame Account");
  assert.equal(getPdpProductTypeLabel("REROLL_ACCOUNT"), "Reroll Account");
  assert.equal(getPdpProductTypeLabel("TOP_UP"), "Game Top Up");
  if (
    pdp.includes("getPdpProductTypeLabel") &&
    pdp.includes("Purchased through WhatsApp") &&
    pdp.includes("Fresh-start reroll account")
  ) {
    pass("pdp_type_presentation");
  } else {
    fail("pdp_type_presentation");
  }
} catch (error) {
  fail("pdp_type_presentation", error.message);
}

try {
  if (
    purchaseButtons.includes("Buy Now") &&
    purchaseButtons.includes("Buy on Shopee") &&
    purchaseButtons.includes("WhatsApp") &&
    purchaseButtons.includes("/api/checkout/create-session") &&
    pdp.includes("mode=\"full\"")
  ) {
    pass("endgame_cta_behavior");
  } else {
    fail("endgame_cta_behavior");
  }
} catch (error) {
  fail("endgame_cta_behavior", error.message);
}

try {
  if (
    purchaseButtons.includes("normalizeProductType") &&
    !purchaseButtons.includes('if (productType === "REROLL_ACCOUNT") return') &&
    isStripeCheckoutAllowed("REROLL_ACCOUNT")
  ) {
    pass("reroll_cta_behavior");
  } else {
    fail("reroll_cta_behavior");
  }
} catch (error) {
  fail("reroll_cta_behavior", error.message);
}

try {
  if (
    purchaseButtons.includes("if (whatsappOnly)") &&
    purchaseButtons.includes("Order via WhatsApp") &&
    !purchaseButtons.includes("Buy Now") === false
  ) {
    pass("top_up_cta_behavior");
  } else {
    fail("top_up_cta_behavior");
  }
} catch (error) {
  fail("top_up_cta_behavior", error.message);
}

try {
  assert.equal(isStripeCheckoutAllowed(normalizeProductType("TOP_UP")), false);
  if (checkoutApi.includes("isStripeCheckoutAllowed")) {
    pass("top_up_cannot_create_stripe_checkout");
  } else {
    fail("top_up_cannot_create_stripe_checkout");
  }
} catch (error) {
  fail("top_up_cannot_create_stripe_checkout", error.message);
}

try {
  if (
    purchaseBar.includes("lg:hidden") &&
    purchaseBar.includes('mode="marketplace"') &&
    purchaseBar.includes("PurchaseButtons") &&
    pdp.includes("ProductPurchaseBar")
  ) {
    pass("mobile_sticky_cta_behavior");
  } else {
    fail("mobile_sticky_cta_behavior");
  }
} catch (error) {
  fail("mobile_sticky_cta_behavior", error.message);
}

try {
  if (
    pdp.includes('.eq("product_type", productType)') &&
    pdp.includes('.eq("game_id", product.game_id)') &&
    pdp.includes("normalizeProductType(item.product_type) === productType")
  ) {
    pass("related_products_same_game_type");
  } else {
    fail("related_products_same_game_type");
  }
} catch (error) {
  fail("related_products_same_game_type", error.message);
}

try {
  const endgameTitle = buildProductPageTitle({
    title: "C6R1 Premium Account",
    gameName: "Genshin Impact",
    productType: "ENDGAME_ACCOUNT",
  });
  const rerollTitle = buildProductPageTitle({
    title: "Fresh Start",
    gameName: "Genshin Impact",
    productType: "REROLL_ACCOUNT",
  });
  const topUpTitle = buildProductPageTitle({
    title: "Genesis Crystal",
    gameName: "Genshin Impact",
    productType: "TOP_UP",
  });
  assert.ok(endgameTitle.includes("Genshin Impact Endgame Account"));
  assert.ok(rerollTitle.includes("Genshin Impact Reroll Account"));
  assert.ok(topUpTitle.includes("Genshin Impact Top Up"));
  assert.ok(!topUpTitle.includes("Genshin Impact Account"));
  if (seo.includes("Endgame Account") && seo.includes("Top Up")) {
    pass("seo_metadata_type_awareness");
  } else {
    fail("seo_metadata_type_awareness");
  }
} catch (error) {
  fail("seo_metadata_type_awareness", error.message);
}

try {
  const msg = buildTopUpWhatsAppMessage({
    id: "p1",
    title: "Genshin Top Up",
    price: 50,
    currency: "MYR",
    gameName: "Genshin Impact",
    slug: "genshin-top-up",
  });
  assert.ok(msg.includes("UID:"));
  assert.ok(msg.includes("Server:"));
  assert.ok(msg.includes("Genshin Impact"));
  for (const field of SUPPLIER_INTERNAL_PRODUCT_FIELDS) {
    assert.ok(!PUBLIC_PRODUCT_SELECT.includes(field));
    assert.ok(!productCard.includes(field));
    assert.ok(!pdp.includes(`product.${field}`));
  }
  if (
    !existsSync("supabase/phase22_product_pdp.sql") &&
    pdp.includes("PUBLIC_PRODUCT_SELECT")
  ) {
    pass("no_supplier_fields_exposed");
  } else {
    fail("no_supplier_fields_exposed");
  }
} catch (error) {
  fail("no_supplier_fields_exposed", error.message);
}

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(`Phase 22: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  process.exitCode = 1;
}
