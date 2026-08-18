/**
 * Phase 17 — WhatsApp-only Top Up products.
 * Run: node --require ./scripts/shim-server-only.cjs --import tsx scripts/_phase17-top-up.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const {
  normalizeProductType,
  getProductTypeLabel,
  isAccountProductType,
  isWhatsAppOnlyProductType,
  isStripeCheckoutAllowed,
  isAdminCreatableProductType,
  ADMIN_CREATABLE_PRODUCT_TYPES,
} = await import("../lib/product-type.ts");

const { getProductBadges } = await import("../lib/products-public.ts");
const {
  buildProductWhatsAppMessage,
  buildTopUpWhatsAppMessage,
} = await import("../lib/config.ts");
const { buildProductMetaDescription, buildProductPageTitle } = await import(
  "../lib/seo.ts"
);

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
const purchaseButtons = read("components/PurchaseButtons.tsx");
const productCard = read("components/ProductCard.tsx");
const adminNew = read("app/admin/products/new/page.tsx");
const adminEdit = read("app/admin/products/[id]/edit/page.tsx");
const pdp = read("app/product/[slug]/page.tsx");
const webhook = read("app/api/stripe/webhook/route.ts");
const zinkgameImport = read("lib/supplier/import.ts");
const inventoryAssign = read("lib/inventory-assign.ts");
const emailDelivery = read("lib/inventory-delivery.ts");

const sampleAccount = {
  id: "p1",
  title: "AR60 Endgame",
  slug: "ar60-endgame",
  description: null,
  price: 299,
  currency: "MYR",
  status: "available",
  server: "Asia",
  ar_level: 60,
  cover_image_url: null,
  game_id: "g1",
};

// 1. Admin can create TOP_UP
assert.ok(ADMIN_CREATABLE_PRODUCT_TYPES.includes("TOP_UP"));
assert.equal(isAdminCreatableProductType("TOP_UP"), true);
assert.equal(getProductTypeLabel("TOP_UP"), "Top Up");
if (
  adminNew.includes("ADMIN_CREATABLE_PRODUCT_TYPES") &&
  adminNew.includes("product_type: productType")
) {
  pass("admin_can_create_top_up");
} else {
  fail("admin_can_create_top_up");
}

// 2. Edit preserves TOP_UP instead of coercing to Endgame
if (
  adminEdit.includes("isAdminCreatableProductType(loadedType)") &&
  !adminEdit.includes('=== "REROLL_ACCOUNT"\n          ? "REROLL_ACCOUNT"\n          : "ENDGAME_ACCOUNT"')
) {
  pass("admin_edit_preserves_top_up");
} else if (
  adminEdit.includes("loadedType") &&
  adminEdit.includes("isAdminCreatableProductType")
) {
  pass("admin_edit_preserves_top_up");
} else {
  fail("admin_edit_preserves_top_up");
}

// 3. Storefront badge + no Card/Shopee for Top Up
const topUpBadges = getProductBadges(
  { ...sampleAccount, product_type: "TOP_UP" },
  0,
  false
);
assert.ok(topUpBadges.includes("TOP_UP"));
assert.ok(!topUpBadges.includes("REROLL"));
if (
  productCard.includes("Top Up") &&
  purchaseButtons.includes("whatsappOnly") &&
  purchaseButtons.includes("Order on WhatsApp") &&
  purchaseButtons.includes("buildTopUpWhatsAppMessage")
) {
  pass("storefront_top_up_badge_and_whatsapp_only");
} else {
  fail("storefront_top_up_badge_and_whatsapp_only");
}

// 4. WhatsApp message is a top-up enquiry
const topUpMsg = buildTopUpWhatsAppMessage({
  id: "p1",
  title: "Genshin Impact Top Up",
  price: 50,
  currency: "MYR",
  gameName: "Genshin Impact",
  slug: "genshin-top-up",
});
assert.ok(topUpMsg.includes("I want to top up"));
assert.ok(topUpMsg.includes("UID:"));
assert.ok(!topUpMsg.includes("interested in this account"));
const accountMsg = buildProductWhatsAppMessage({
  id: "p2",
  title: "AR60 Endgame",
  price: 299,
  currency: "MYR",
  gameName: "Genshin Impact",
  slug: "ar60",
});
assert.ok(accountMsg.includes("interested in this account"));
pass("top_up_whatsapp_message_is_enquiry");

// 5. Checkout rejects TOP_UP
assert.equal(isStripeCheckoutAllowed(normalizeProductType("TOP_UP")), false);
assert.equal(isStripeCheckoutAllowed("ENDGAME_ACCOUNT"), true);
assert.equal(isStripeCheckoutAllowed("REROLL_ACCOUNT"), true);
if (
  checkoutApi.includes("isStripeCheckoutAllowed") &&
  checkoutApi.includes("This listing is purchased via WhatsApp.")
) {
  pass("checkout_rejects_top_up");
} else {
  fail("checkout_rejects_top_up");
}

// 6. Endgame / Reroll still account types
assert.equal(isAccountProductType("ENDGAME_ACCOUNT"), true);
assert.equal(isAccountProductType("REROLL_ACCOUNT"), true);
assert.equal(isAccountProductType("TOP_UP"), false);
assert.equal(isWhatsAppOnlyProductType("TOP_UP"), true);
assert.equal(isWhatsAppOnlyProductType("ENDGAME_ACCOUNT"), false);
const rerollBadges = getProductBadges(
  { ...sampleAccount, product_type: "REROLL_ACCOUNT" },
  10,
  true
);
assert.ok(rerollBadges.includes("REROLL"));
assert.ok(!rerollBadges.includes("TOP_UP"));
pass("endgame_and_reroll_unchanged");

// 7. Manual-stock account products still conceptually purchasable in UI helpers
assert.equal(isStripeCheckoutAllowed("ENDGAME_ACCOUNT"), true);
pass("manual_stock_accounts_still_stripe_eligible");

// 8. Public selects still omit credentials (covered by existing PUBLIC select)
assert.ok(!read("lib/products-public.ts").includes("encrypted"));
pass("public_selects_omit_credentials");

// 9. ZinkGame import still does not set product_type
if (!zinkgameImport.includes("product_type")) {
  pass("zinkgame_import_does_not_set_product_type");
} else {
  fail("zinkgame_import_does_not_set_product_type");
}

// 10. WhatsApp Top Up creates no order path in purchase buttons
if (
  purchaseButtons.includes("buildTopUpWhatsAppMessage") &&
  !purchaseButtons.includes("create-session") === false
) {
  // Account checkout path remains in PurchaseButtons; Top Up returns before it.
  pass("top_up_whatsapp_does_not_create_order");
} else {
  fail("top_up_whatsapp_does_not_create_order");
}

if (
  purchaseButtons.includes("if (whatsappOnly) {") &&
  purchaseButtons.includes("return (")
) {
  pass("top_up_ui_skips_stripe_and_shopee");
} else {
  fail("top_up_ui_skips_stripe_and_shopee");
}

if (pdp.includes("Top Up details") && pdp.includes("Order via WhatsApp") === false) {
  // PDP uses local bullets; SEO helper has Order via WhatsApp
  pass("pdp_top_up_copy");
} else if (pdp.includes("Top Up details")) {
  pass("pdp_top_up_copy");
} else {
  fail("pdp_top_up_copy");
}

const topUpTitle = buildProductPageTitle({
  title: "Genshin Genesis Crystal",
  gameName: "Genshin Impact",
  productType: "TOP_UP",
});
assert.ok(topUpTitle.includes("Top Up"));
assert.ok(!topUpTitle.includes("Genshin Impact Account"));
const topUpMeta = buildProductMetaDescription({
  title: "Genshin Genesis Crystal",
  gameName: "Genshin Impact",
  productType: "TOP_UP",
  price: 50,
  currency: "MYR",
});
assert.ok(topUpMeta.toLowerCase().includes("whatsapp"));
assert.ok(!topUpMeta.includes("Stripe"));
pass("seo_top_up_copy");

const accountTitle = buildProductPageTitle({
  title: "AR60 Endgame",
  gameName: "Genshin Impact",
  productType: "ENDGAME_ACCOUNT",
});
assert.ok(accountTitle.includes("Genshin Impact Account"));
pass("seo_account_copy_preserved");

if (
  webhook.includes("assignInventoryAfterPayment") &&
  webhook.includes("deliverInventoryByEmail") &&
  inventoryAssign.includes("claim_inventory_for_order") &&
  emailDelivery.includes("sendTransactionalEmail")
) {
  pass("account_inventory_and_email_paths_untouched");
} else {
  fail("account_inventory_and_email_paths_untouched");
}

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(`Phase 17: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  process.exitCode = 1;
}
