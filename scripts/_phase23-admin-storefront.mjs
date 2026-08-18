/**
 * Phase 23 — admin product management + public storefront cleanup.
 * Run: node --import tsx scripts/_phase23-admin-storefront.mjs
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const {
  sanitizePublicProductDescription,
  PUBLIC_PRODUCT_SELECT,
  SUPPLIER_INTERNAL_PRODUCT_FIELDS,
} = await import("../lib/products-public.ts");

const {
  isWhatsAppOnlyProductType,
  isStripeCheckoutAllowed,
  normalizeProductType,
  PRODUCT_TYPES,
} = await import("../lib/product-type.ts");

const { buildSupplierDescription } = await import("../lib/supplier/description.ts");

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

const adminProducts = read("app/admin/products/page.tsx");
const adminEdit = read("app/admin/products/[id]/edit/page.tsx");
const pdp = read("app/product/[slug]/page.tsx");
const purchaseButtons = read("components/PurchaseButtons.tsx");
const purchaseBar = read("components/ProductPurchaseBar.tsx");
const productCard = read("components/ProductCard.tsx");
const footer = read("components/Footer.tsx");
const homePage = read("app/page.tsx");
const productsClient = read("components/ProductsClient.tsx");
const globals = read("app/globals.css");
const catalog = read("lib/catalog-server.ts");
const zinkgameImport = read("lib/supplier/import.ts");
const supplierDescription = read("lib/supplier/description.ts");
const checkoutApi = read("app/api/checkout/create-session/route.ts");

const publicPurchaseSurfaces = [
  purchaseButtons,
  purchaseBar,
  productCard,
  pdp,
  homePage,
  productsClient,
  footer,
];

try {
  const dirty =
    "Original supplier title: H4712 COLUM C2 VÀ NHỮNG NGƯỜI BẠN\n\n<p><img src=\"../../images/127c5919017b47d4b234bfaea1944919.jpg\"></p>";
  const cleaned = sanitizePublicProductDescription(dirty);
  assert.equal(cleaned, null);
  assert.equal(
    sanitizePublicProductDescription("Merchant-written AR60 C2 listing."),
    "Merchant-written AR60 C2 listing."
  );
  if (
    catalog.includes("sanitizePublicProductDescription") &&
    pdp.includes("withSanitizedPublicDescription") &&
    !pdp.includes("Original supplier title")
  ) {
    pass("supplier_original_title_hidden_publicly");
  } else {
    fail("supplier_original_title_hidden_publicly");
  }
} catch (error) {
  fail("supplier_original_title_hidden_publicly", error.message);
}

try {
  const htmlOnly = '<p><img src="../../images/127c5919017b47d4b234bfaea1944919.jpg"></p>';
  assert.equal(sanitizePublicProductDescription(htmlOnly), null);
  if (
    pdp.includes("sanitizePublicProductDescription") &&
    productCard.includes("sanitizePublicProductDescription")
  ) {
    pass("raw_supplier_html_hidden_publicly");
  } else {
    fail("raw_supplier_html_hidden_publicly");
  }
} catch (error) {
  fail("raw_supplier_html_hidden_publicly", error.message);
}

try {
  if (
    globals.includes("--background: #0f172a") &&
    globals.includes("--surface-card: #1a2744") &&
    globals.includes(".hero-compact") &&
    homePage.includes("TYPE_SECTIONS") &&
    homePage.includes("Endgame Accounts") &&
    homePage.includes("Reroll Accounts") &&
    homePage.includes("Game Top Up")
  ) {
    pass("public_storefront_dark_theme");
  } else {
    fail("public_storefront_dark_theme");
  }
} catch (error) {
  fail("public_storefront_dark_theme", error.message);
}

try {
  const leaked = publicPurchaseSurfaces.some(
    (source) =>
      source.includes("Buy on Shopee") ||
      source.includes("btn-shopee") ||
      source.includes("Shopee store")
  );
  if (!leaked) {
    pass("shopee_button_absent_publicly");
  } else {
    fail("shopee_button_absent_publicly");
  }
} catch (error) {
  fail("shopee_button_absent_publicly", error.message);
}

try {
  if (
    purchaseButtons.includes("Buy Now") &&
    purchaseButtons.includes("WhatsApp") &&
    purchaseButtons.includes("/api/checkout/create-session") &&
    isStripeCheckoutAllowed(normalizeProductType("ENDGAME_ACCOUNT")) &&
    !purchaseButtons.includes("Buy on Shopee")
  ) {
    pass("endgame_card_and_whatsapp");
  } else {
    fail("endgame_card_and_whatsapp");
  }
} catch (error) {
  fail("endgame_card_and_whatsapp", error.message);
}

try {
  if (
    isStripeCheckoutAllowed("REROLL_ACCOUNT") &&
    purchaseButtons.includes("normalizeProductType") &&
    !purchaseButtons.includes('if (productType === "REROLL_ACCOUNT") return')
  ) {
    pass("reroll_card_and_whatsapp");
  } else {
    fail("reroll_card_and_whatsapp");
  }
} catch (error) {
  fail("reroll_card_and_whatsapp", error.message);
}

try {
  assert.equal(isWhatsAppOnlyProductType("TOP_UP"), true);
  assert.equal(isStripeCheckoutAllowed("TOP_UP"), false);
  if (
    purchaseButtons.includes("if (whatsappOnly)") &&
    purchaseButtons.includes("Order via WhatsApp") &&
    purchaseButtons.includes("Order on WhatsApp") &&
    checkoutApi.includes("isStripeCheckoutAllowed")
  ) {
    pass("top_up_whatsapp_only");
  } else {
    fail("top_up_whatsapp_only");
  }
} catch (error) {
  fail("top_up_whatsapp_only", error.message);
}

try {
  assert.ok(PRODUCT_TYPES.includes("ENDGAME_ACCOUNT"));
  if (
    adminProducts.includes("typeFilter") &&
    adminProducts.includes("PRODUCT_TYPES") &&
    adminProducts.includes("REROLL_ACCOUNT") &&
    adminProducts.includes("TOP_UP") &&
    adminProducts.includes("All types")
  ) {
    pass("admin_filter_by_product_type");
  } else {
    fail("admin_filter_by_product_type");
  }
} catch (error) {
  fail("admin_filter_by_product_type", error.message);
}

try {
  if (adminProducts.includes("gameFilter") && adminProducts.includes("All games")) {
    pass("admin_filter_by_game");
  } else {
    fail("admin_filter_by_game");
  }
} catch (error) {
  fail("admin_filter_by_game", error.message);
}

try {
  if (
    adminProducts.includes("product.title.toLowerCase().includes(query)") &&
    adminProducts.includes("(product.slug || \"\").toLowerCase().includes(query)")
  ) {
    pass("admin_search_title_slug");
  } else {
    fail("admin_search_title_slug");
  }
} catch (error) {
  fail("admin_search_title_slug", error.message);
}

try {
  const built = buildSupplierDescription(
    "H4712 COLUM C2 VÀ NHỮNG NGƯỜI BẠN",
    "<p><img src=\"../../images/x.jpg\"></p>"
  );
  assert.match(built, /Original supplier title:/);
  if (
    zinkgameImport.includes("buildSupplierDescription") &&
    supplierDescription.includes("Original supplier title:") &&
    adminEdit.includes("setDescription(product.description || \"\")")
  ) {
    pass("zinkgame_supplier_description_unchanged");
  } else {
    fail("zinkgame_supplier_description_unchanged");
  }
} catch (error) {
  fail("zinkgame_supplier_description_unchanged", error.message);
}

try {
  assert.ok(PUBLIC_PRODUCT_SELECT.includes("product_type"));
  for (const field of SUPPLIER_INTERNAL_PRODUCT_FIELDS) {
    assert.ok(!PUBLIC_PRODUCT_SELECT.includes(field));
  }
  if (
    !existsSync("supabase/phase23_admin_storefront.sql") &&
    adminProducts.includes("product_type") &&
    adminEdit.includes("isWhatsAppOnlyProductType") &&
    adminEdit.includes("does not use inventory assignment")
  ) {
    pass("existing_product_type_intact_no_new_schema");
  } else {
    fail("existing_product_type_intact_no_new_schema");
  }
} catch (error) {
  fail("existing_product_type_intact_no_new_schema", error.message);
}

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(`Phase 23: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  process.exitCode = 1;
}
