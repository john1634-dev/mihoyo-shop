/**
 * Phase 12 test runner.
 */
import { readFile } from "node:fs/promises";
import {
  buildSupplierOriginalStoragePath,
  buildSupplierProcessedStoragePath,
  extensionForImageFormat,
  extractProductImageStoragePath,
} from "../lib/supplier/image-storage";

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
  const imageImportRoute = await readFile(
    "app/api/admin/suppliers/zinkgame/images/import/route.ts",
    "utf8"
  );
  const imageImportLib = await readFile("lib/supplier/image-import.ts", "utf8");
  const imageStorageLib = await readFile("lib/supplier/image-storage.ts", "utf8");
  const importLib = await readFile("lib/supplier/import.ts", "utf8");
  const pipelineLib = await readFile("lib/image-processing/index.ts", "utf8");
  const adminPage = await readFile("app/admin/suppliers/zinkgame/page.tsx", "utf8");
  const previewCard = await readFile(
    "components/admin/SupplierProductPreviewCard.tsx",
    "utf8"
  );

  if (imageImportRoute.includes("requireAdmin")) pass("image_import_requires_admin");
  else fail("image_import_requires_admin");

  if (imageImportRoute.includes("confirm: true")) pass("image_import_requires_confirm");
  else fail("image_import_requires_confirm");

  if (imageImportLib.includes("zinkgameAdapter.getProduct")) {
    pass("server_refetch_supplier_images");
  } else {
    fail("server_refetch_supplier_images");
  }

  if (
    !imageImportRoute.includes("body.images") &&
    imageImportLib.includes("fetchLiveSupplierProduct")
  ) {
    pass("browser_image_urls_ignored");
  } else {
    fail("browser_image_urls_ignored");
  }

  if (imageImportLib.includes("processSupplierImage")) pass("uses_image_processing_pipeline");
  else fail("uses_image_processing_pipeline");

  if (imageImportLib.includes("buildSupplierOriginalStoragePath")) {
    pass("original_image_preservation");
  } else {
    fail("original_image_preservation");
  }

  if (imageImportLib.includes("original_image_url")) pass("stores_supplier_original_url");
  else fail("stores_supplier_original_url");

  if (imageImportLib.includes("processed_image_url")) pass("stores_processed_image_url");
  else fail("stores_processed_image_url");

  if (imageImportLib.includes('image_source: "supplier"')) pass("product_images_supplier_source");
  else fail("product_images_supplier_source");

  if (imageImportLib.includes("cover_image_url")) pass("updates_cover_image_url");
  else fail("updates_cover_image_url");

  if (imageImportLib.includes("validateImageDimensions")) pass("image_dimension_validation");
  else fail("image_dimension_validation");

  if (imageImportLib.includes("removeProductImageStoragePaths")) pass("storage_rollback_on_failure");
  else fail("storage_rollback_on_failure");

  if (imageImportLib.includes("IMAGE_IMPORT_CONCURRENCY")) pass("concurrency_limit");
  else fail("concurrency_limit");

  if (imageImportLib.includes("existingUrls.has")) pass("duplicate_url_protection");
  else fail("duplicate_url_protection");

  if (
    !importLib.includes("processSupplierImage") &&
    importLib.includes("cover_image_url: null")
  ) {
    pass("product_import_still_defers_images");
  } else {
    fail("product_import_still_defers_images");
  }

  if (
    !pipelineLib.includes("storage.upload") &&
    !pipelineLib.includes('.from("product_images")')
  ) {
    pass("processing_lib_stays_pure");
  } else {
    fail("processing_lib_stays_pure");
  }

  if (imageStorageLib.includes("getSupabaseService")) pass("server_side_storage_upload");
  else fail("server_side_storage_upload");

  const originalPath = buildSupplierOriginalStoragePath("prod-1", "jpg");
  const processedPath = buildSupplierProcessedStoragePath("prod-1", "jpg");
  if (
    originalPath.includes("/supplier/original/") &&
    processedPath.includes("/supplier/processed/")
  ) {
    pass("storage_path_convention");
  } else {
    fail("storage_path_convention");
  }

  if (extensionForImageFormat("jpeg") === "jpg") pass("format_extension_mapping");
  else fail("format_extension_mapping");

  const sampleUrl =
    "https://example.supabase.co/storage/v1/object/public/product-images/products/a.jpg";
  if (extractProductImageStoragePath(sampleUrl) === "products/a.jpg") {
    pass("extract_storage_path_helper");
  } else {
    fail("extract_storage_path_helper");
  }

  if (adminPage.includes("Import Images")) pass("admin_image_import_ui");
  else fail("admin_image_import_ui");

  if (previewCard.includes("onImportImages")) pass("preview_card_image_import_button");
  else fail("preview_card_image_import_button");

  if (!imageImportLib.includes("inventory")) pass("no_inventory_changes");
  else fail("no_inventory_changes");

  if (!imageImportLib.includes("stripe")) pass("no_stripe_changes");
  else fail("no_stripe_changes");

  if (!imageImportLib.includes("orders")) pass("no_order_changes");
  else fail("no_order_changes");

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nPhase 12: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
