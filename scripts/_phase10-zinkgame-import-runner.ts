/**
 * Phase 10 test runner.
 */
import { readFile } from "node:fs/promises";
import { computeCostMyr } from "../lib/costing";
import {
  resolveGameIdFromSupplierCategory,
  extractSupplierCategory,
} from "../lib/supplier/game-mapping";
import {
  calculateSupplierSellingPrice,
  SupplierPricingError,
} from "../lib/supplier/pricing";
import { createSlug } from "../lib/validation";
import {
  isSupplierCatalogActive,
  normalizeSupplierSourceStatus,
} from "../lib/supplier/status";

const results: { name: string; ok: boolean }[] = [];

function pass(name: string) {
  results.push({ name, ok: true });
  console.log(`PASS ${name}`);
}

function fail(name: string, detail = "") {
  results.push({ name, ok: false });
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
}

async function main() {
  const previewRoute = await readFile(
    "app/api/admin/suppliers/zinkgame/preview/route.ts",
    "utf8"
  );
  const importRoute = await readFile(
    "app/api/admin/suppliers/zinkgame/import/route.ts",
    "utf8"
  );
  const listingRoute = await readFile(
    "app/api/admin/suppliers/zinkgame/listing/route.ts",
    "utf8"
  );
  const importLib = await readFile("lib/supplier/import.ts", "utf8");
  const adminPage = await readFile("app/admin/suppliers/zinkgame/page.tsx", "utf8");

  if (previewRoute.includes("requireAdmin")) pass("preview_requires_admin");
  else fail("preview_requires_admin");

  if (importRoute.includes("requireAdmin")) pass("import_requires_admin");
  else fail("import_requires_admin");

  if (listingRoute.includes("requireAdmin")) pass("listing_requires_admin");
  else fail("listing_requires_admin");

  if (importLib.includes("fetchSupplierProductForImport")) {
    pass("server_side_revalidation");
  } else {
    fail("server_side_revalidation");
  }

  if (importLib.includes("zinkgameAdapter.getProduct")) {
    pass("import_refetches_supplier_detail");
  } else {
    fail("import_refetches_supplier_detail");
  }

  if (importLib.includes("findExistingImportedProduct")) {
    pass("duplicate_protection_lookup");
  } else {
    fail("duplicate_protection_lookup");
  }

  if (importLib.includes("isUniqueViolation")) pass("unique_violation_handling");
  else fail("unique_violation_handling");

  if (importLib.includes('reason: "already_imported"')) {
    pass("already_imported_response");
  } else {
    fail("already_imported_response");
  }

  if (importLib.includes('reason: "invalid_source"')) pass("invalid_source_response");
  else fail("invalid_source_response");

  if (importLib.includes('reason: "invalid_supplier_status"')) {
    pass("invalid_supplier_status_response");
  } else {
    fail("invalid_supplier_status_response");
  }

  if (importLib.includes('reason: "game_mapping_required"')) {
    pass("game_mapping_required_response");
  } else {
    fail("game_mapping_required_response");
  }

  if (
    !importLib.includes('.from("product_images")') &&
    importLib.includes("cover_image_url: null")
  ) {
    pass("no_public_supplier_images_on_import");
  } else {
    fail("no_public_supplier_images_on_import");
  }

  if (importLib.includes("imageImportStatus: \"pending\"")) {
    pass("image_import_pending_flag");
  } else {
    fail("image_import_pending_flag");
  }

  if (isSupplierCatalogActive("active")) pass("active_supplier_importable");
  else fail("active_supplier_importable");

  if (!isSupplierCatalogActive("sold")) pass("sold_supplier_not_importable");
  else fail("sold_supplier_not_importable");

  const games = [
    { id: "g1", name: "Genshin Impact" },
    { id: "g2", name: "Honkai: Star Rail" },
  ];
  const genshinId = resolveGameIdFromSupplierCategory("Genshin Impact", games);
  if (genshinId === "g1") pass("game_mapping_genshin");
  else fail("game_mapping_genshin", genshinId ?? "null");

  const unknownId = resolveGameIdFromSupplierCategory("Unknown Game XYZ", games);
  if (unknownId === null) pass("game_mapping_unknown_returns_null");
  else fail("game_mapping_unknown_returns_null", unknownId);

  const category = extractSupplierCategory({ category: "Genshin Impact" });
  if (category === "Genshin Impact") pass("extract_supplier_category");
  else fail("extract_supplier_category");

  const pricing = calculateSupplierSellingPrice({
    supplierPrice: Math.round(100 / 0.00018),
    supplierCurrency: "VND",
    markupPercent: 100,
    exchangeRate: 0.00018,
  });
  if (Math.abs(pricing.sellingPriceMyr - pricing.costMyr * 2) < 0.02) {
    pass("markup_100_doubles_cost");
  } else {
    fail("markup_100_doubles_cost", String(pricing.sellingPriceMyr));
  }

  const cost = computeCostMyr(3_500_000, 0.00018);
  if (Math.abs(cost - 630) < 0.01) pass("vnd_to_myr_costing");
  else fail("vnd_to_myr_costing", String(cost));

  const slugBase = createSlug("H4702 CN Server Neu C6 And Friends");
  const slugCollision = createSlug("H4702 CN Server Neu C6 And Friends!!!");
  if (slugBase && slugBase === slugCollision) pass("slug_normalization");
  else fail("slug_normalization");

  if (importLib.includes("resolveUniqueProductSlug")) pass("slug_collision_helper");
  else fail("slug_collision_helper");

  try {
    calculateSupplierSellingPrice({
      supplierPrice: 1000,
      supplierCurrency: "VND",
      markupPercent: -5,
      exchangeRate: 0.00018,
    });
    fail("negative_markup_rejected");
  } catch (error) {
    if (error instanceof SupplierPricingError) pass("negative_markup_rejected");
    else fail("negative_markup_rejected");
  }

  if (importRoute.includes("toUserError")) pass("safe_error_response");
  else fail("safe_error_response");

  if (
    !importRoute.includes("SERVICE_ROLE") &&
    !importRoute.includes("process.env.TRANSLATION_API_KEY")
  ) {
    pass("no_secrets_in_import_route");
  } else {
    fail("no_secrets_in_import_route");
  }

  if (adminPage.includes("ConfirmDialog")) pass("import_confirmation_ui");
  else fail("import_confirmation_ui");

  if (adminPage.includes("Pagination not detected") || adminPage.includes("paginationLabel")) {
    pass("listing_pagination_ui");
  } else {
    fail("listing_pagination_ui");
  }

  if (previewRoute.includes("getImportStatus")) pass("preview_import_status");
  else fail("preview_import_status");

  if (normalizeSupplierSourceStatus("sold") === "sold") {
    pass("supplier_status_normalization");
  } else {
    fail("supplier_status_normalization");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\nPhase 10 tests: ${results.length - failed.length}/${results.length} passed`
  );
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
