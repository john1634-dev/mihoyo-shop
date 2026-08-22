/**
 * Phase 24 — supplier auto-import lifecycle + admin delete.
 * Run: node --import tsx scripts/_phase24-supplier-lifecycle.mjs
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const {
  extractSupplierAccountCode,
  buildStorefrontTitleFromSupplierTitle,
  collectCatalogAccountCodes,
  assessZinkGameCatalogFetch,
} = await import("../lib/supplier/account-code.ts");

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

const importLib = read("lib/supplier/import.ts");
const previewLib = read("lib/supplier/preview.ts");
const autoImportLib = read("lib/supplier/auto-import.ts");
const scheduledSync = read("lib/supplier/scheduled-sync.ts");
const autoDeleteLib = read("lib/supplier/auto-delete.ts");
const adminDeleteLib = read("lib/admin-product-delete.ts");
const adminProductsPage = read("app/admin/products/page.tsx");
const deleteRoute = read("app/api/admin/products/delete/route.ts");
const zinkgameImport = read("lib/supplier/import.ts");
const migration = read("supabase/phase24_supplier_lifecycle.sql");

try {
  assert.equal(
    extractSupplierAccountCode("H4723 acc dư 53 day thẻ tháng, team nguyệt"),
    "H4723"
  );
  assert.equal(
    buildStorefrontTitleFromSupplierTitle("H5831 acc genshin ngon giá rẻ"),
    "H5831"
  );
  pass("account_code_extracted_from_supplier_titles");
} catch (error) {
  fail("account_code_extracted_from_supplier_titles", error.message);
}

try {
  const catalog = collectCatalogAccountCodes([
    "H4723 acc dư 53 day thẻ tháng",
    "H4725 fresh listing",
  ]);
  assert.ok(catalog.has("H4723"));
  assert.ok(catalog.has("H4725"));
  assert.ok(!catalog.has("H4724"));

  const assessment = assessZinkGameCatalogFetch({
    items: [{ title: "H4723 acc" }, { title: "H4725 acc" }],
    errors: [],
  });
  assert.equal(assessment.complete, true);
  assert.ok(assessment.accountCodes.has("H4723"));
  assert.ok(!assessment.accountCodes.has("H4724"));
  pass("missing_auto_import_code_detected_in_complete_catalog");
} catch (error) {
  fail("missing_auto_import_code_detected_in_complete_catalog", error.message);
}

try {
  if (
    autoDeleteLib.includes('.eq("source_import_mode", "auto")') &&
    autoDeleteLib.includes("reconcileMissingAutoImportedProducts") &&
    scheduledSync.includes("reconcileMissingAutoImportedProducts") &&
    (importLib.includes('importMode: "manual"') ||
      importLib.includes('?? "manual"')) &&
    autoImportLib.includes('importMode: "auto"') &&
    read("app/api/admin/suppliers/zinkgame/import/route.ts").includes(
      'importMode: "manual"'
    )
  ) {
    pass("manual_import_never_auto_deleted");
  } else {
    fail("manual_import_never_auto_deleted");
  }
} catch (error) {
  fail("manual_import_never_auto_deleted", error.message);
}

try {
  if (
    autoDeleteLib.includes('source_import_mode", "auto"') &&
    !autoDeleteLib.includes('source_import_mode", "manual"')
  ) {
    pass("normal_manual_products_not_auto_deleted");
  } else {
    fail("normal_manual_products_not_auto_deleted");
  }
} catch (error) {
  fail("normal_manual_products_not_auto_deleted", error.message);
}

try {
  const failedFetch = assessZinkGameCatalogFetch({
    items: [],
    errors: [{ message: "HTTP 503" }],
  });
  assert.equal(failedFetch.complete, false);
  assert.equal(failedFetch.reason, "category_fetch_errors");

  if (
    scheduledSync.includes("assessZinkGameCatalogFetch") &&
    scheduledSync.includes("catalogAssessment.complete") &&
    scheduledSync.includes("auto-delete skipped")
  ) {
    pass("failed_supplier_fetch_blocks_auto_delete");
  } else {
    fail("failed_supplier_fetch_blocks_auto_delete");
  }
} catch (error) {
  fail("failed_supplier_fetch_blocks_auto_delete", error.message);
}

try {
  const unparsed = assessZinkGameCatalogFetch({
    items: [{ title: "no account code here" }],
    errors: [],
  });
  assert.equal(unparsed.complete, false);
  assert.equal(unparsed.reason, "no_account_codes_parsed");
  pass("invalid_catalog_parse_blocks_auto_delete");
} catch (error) {
  fail("invalid_catalog_parse_blocks_auto_delete", error.message);
}

try {
  if (
    adminDeleteLib.includes("order_items") &&
    adminDeleteLib.includes('status: "hidden"') &&
    adminDeleteLib.includes("has_order_history")
  ) {
    pass("order_history_protected_from_hard_delete");
  } else {
    fail("order_history_protected_from_hard_delete");
  }
} catch (error) {
  fail("order_history_protected_from_hard_delete", error.message);
}

try {
  if (
    adminProductsPage.includes("ConfirmDialog") &&
    adminProductsPage.includes("/api/admin/products/delete") &&
    deleteRoute.includes("confirm: true")
  ) {
    pass("admin_delete_requires_confirmation");
  } else {
    fail("admin_delete_requires_confirmation");
  }
} catch (error) {
  fail("admin_delete_requires_confirmation", error.message);
}

try {
  if (
    !previewLib.includes("translateSupplierTitle") &&
    !importLib.includes("translateSupplierTitle") &&
    !autoImportLib.includes('translationProvider: "ai"')
  ) {
    pass("supplier_title_translation_removed_from_import_flow");
  } else {
    fail("supplier_title_translation_removed_from_import_flow");
  }
} catch (error) {
  fail("supplier_title_translation_removed_from_import_flow", error.message);
}

try {
  if (
    scheduledSync.includes("runSafeAutoSync") &&
    scheduledSync.includes("runZinkGameCategoryAutoImport") &&
    zinkgameImport.includes("buildSupplierDescription") &&
    buildSupplierDescription("H1", "desc").includes("Original supplier title:")
  ) {
    pass("existing_supplier_sync_behavior_preserved");
  } else {
    fail("existing_supplier_sync_behavior_preserved");
  }
} catch (error) {
  fail("existing_supplier_sync_behavior_preserved", error.message);
}

try {
  const previewSource = read("lib/supplier/preview.ts");
  assert.ok(!previewSource.includes("translateSupplierTitle"));
  assert.ok(previewSource.includes("buildStorefrontTitleFromSupplierTitle"));
  assert.ok(existsSync("supabase/phase24_supplier_lifecycle.sql"));
  assert.ok(migration.includes("source_account_code"));
  assert.ok(migration.includes("source_import_mode"));
  pass("lifecycle_schema_and_preview_helpers_present");
} catch (error) {
  fail("lifecycle_schema_and_preview_helpers_present", error.message);
}

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(`Phase 24: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  process.exitCode = 1;
}
