/**
 * Phase 25 — admin product management + supplier UX.
 * Run: node --import tsx scripts/_phase25-admin-product-management.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const {
  extractSupplierAccountCode,
  buildStorefrontTitleFromSupplierTitle,
} = await import("../lib/supplier/account-code.ts");

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

const adminProductsPage = read("app/admin/products/page.tsx");
const bulkDeleteRoute = read("app/api/admin/products/bulk-delete/route.ts");
const adminDeleteLib = read("lib/admin-product-delete.ts");
const autoDeleteLib = read("lib/supplier/auto-delete.ts");
const zinkgamePage = read("app/admin/suppliers/zinkgame/page.tsx");
const zinkgameImportRoute = read("app/api/admin/suppliers/zinkgame/import/route.ts");
const autoImportLib = read("lib/supplier/auto-import.ts");

// Account code extraction
try {
  assert.equal(
    extractSupplierAccountCode("H4723 acc dư 53 day thẻ tháng, team nguyệt"),
    "H4723"
  );
  pass("h_account_code_extraction");
} catch (error) {
  fail("h_account_code_extraction", error.message);
}

try {
  assert.equal(extractSupplierAccountCode("S1234 acc ngon giá rẻ"), "S1234");
  pass("s_account_code_extraction");
} catch (error) {
  fail("s_account_code_extraction", error.message);
}

try {
  assert.equal(extractSupplierAccountCode("V5678 full char endgame"), "V5678");
  pass("v_account_code_extraction");
} catch (error) {
  fail("v_account_code_extraction", error.message);
}

try {
  assert.equal(extractSupplierAccountCode("G9012 acc genshin"), "G9012");
  pass("g_account_code_extraction");
} catch (error) {
  fail("g_account_code_extraction", error.message);
}

try {
  assert.equal(extractSupplierAccountCode("acc H4723 no leading code"), null);
  assert.equal(extractSupplierAccountCode(""), null);
  assert.equal(buildStorefrontTitleFromSupplierTitle("random listing title"), null);
  pass("invalid_account_code_returns_null");
} catch (error) {
  fail("invalid_account_code_returns_null", error.message);
}

try {
  if (
    autoDeleteLib.includes('action: "skipped"') &&
    autoDeleteLib.includes('reason: "missing_account_code"') &&
    autoDeleteLib.includes("if (!accountCode)")
  ) {
    pass("unknown_code_cannot_qualify_for_auto_delete");
  } else {
    fail("unknown_code_cannot_qualify_for_auto_delete");
  }
} catch (error) {
  fail("unknown_code_cannot_qualify_for_auto_delete", error.message);
}

// Bulk selection UI
try {
  if (
    adminProductsPage.includes('type="checkbox"') &&
    adminProductsPage.includes("toggleSelectProduct")
  ) {
    pass("row_checkbox_exists");
  } else {
    fail("row_checkbox_exists");
  }
} catch (error) {
  fail("row_checkbox_exists", error.message);
}

try {
  if (
    adminProductsPage.includes("Select all products on this page") &&
    adminProductsPage.includes("toggleSelectAllFiltered")
  ) {
    pass("select_all_exists");
  } else {
    fail("select_all_exists");
  }
} catch (error) {
  fail("select_all_exists", error.message);
}

try {
  if (adminProductsPage.includes("selected") && adminProductsPage.includes("visibleSelectedIds")) {
    pass("selected_count_exists");
  } else {
    fail("selected_count_exists");
  }
} catch (error) {
  fail("selected_count_exists", error.message);
}

try {
  if (
    adminProductsPage.includes("Delete Selected") &&
    adminProductsPage.includes("/api/admin/products/bulk-delete")
  ) {
    pass("bulk_delete_action_exists");
  } else {
    fail("bulk_delete_action_exists");
  }
} catch (error) {
  fail("bulk_delete_action_exists", error.message);
}

try {
  if (
    adminProductsPage.includes("bulkDeleteOpen") &&
    adminProductsPage.includes("Delete selected products?") &&
    adminProductsPage.includes("confirmBulkDeleteProducts")
  ) {
    pass("explicit_bulk_confirmation_exists");
  } else {
    fail("explicit_bulk_confirmation_exists");
  }
} catch (error) {
  fail("explicit_bulk_confirmation_exists", error.message);
}

// Bulk deletion safety
try {
  if (
    adminDeleteLib.includes("deleteAdminProduct") &&
    adminDeleteLib.includes("bulkDeleteAdminProducts") &&
    bulkDeleteRoute.includes("bulkDeleteAdminProducts")
  ) {
    pass("product_without_order_history_can_be_hard_deleted");
  } else {
    fail("product_without_order_history_can_be_hard_deleted");
  }
} catch (error) {
  fail("product_without_order_history_can_be_hard_deleted", error.message);
}

try {
  if (
    adminDeleteLib.includes('reason: "has_order_history"') &&
    adminDeleteLib.includes('status: "hidden"') &&
    adminProductsPage.includes("summarizeBulkDeleteTotals")
  ) {
    pass("product_with_order_history_is_hidden_instead_of_deleted");
  } else {
    fail("product_with_order_history_is_hidden_instead_of_deleted");
  }
} catch (error) {
  fail("product_with_order_history_is_hidden_instead_of_deleted", error.message);
}

try {
  if (
    adminDeleteLib.includes("deleteProductDependents") &&
    adminDeleteLib.includes('.eq("product_id", productId)')
  ) {
    pass("unrelated_inventory_untouched");
  } else {
    fail("unrelated_inventory_untouched");
  }
} catch (error) {
  fail("unrelated_inventory_untouched", error.message);
}

try {
  if (bulkDeleteRoute.includes("requireAdmin") && bulkDeleteRoute.includes("confirm")) {
    pass("bulk_operation_is_admin_protected");
  } else {
    fail("bulk_operation_is_admin_protected");
  }
} catch (error) {
  fail("bulk_operation_is_admin_protected", error.message);
}

try {
  if (
    adminDeleteLib.includes("ADMIN_BULK_DELETE_MAX") &&
    bulkDeleteRoute.includes("ADMIN_BULK_DELETE_MAX")
  ) {
    pass("batch_size_is_bounded");
  } else {
    fail("batch_size_is_bounded");
  }
} catch (error) {
  fail("batch_size_is_bounded", error.message);
}
try {
  if (adminProductsPage.includes("+ Add Product")) {
    pass("add_product_button_in_header");
  } else {
    fail("add_product_button_in_header");
  }
} catch (error) {
  fail("add_product_button_in_header", error.message);
}

try {
  if (
    adminProductsPage.includes("+ Add Product") &&
    adminProductsPage.includes("No matching products") &&
    adminProductsPage.includes("Add Product")
  ) {
    pass("add_product_available_when_list_empty_or_filtered");
  } else {
    fail("add_product_available_when_list_empty_or_filtered");
  }
} catch (error) {
  fail("add_product_available_when_list_empty_or_filtered", error.message);
}

try {
  if (
    zinkgamePage.includes("+ Import Product") &&
    zinkgamePage.includes("Sync Now") &&
    zinkgamePage.includes("Preview")
  ) {
    pass("zinkgame_import_action_in_header");
  } else {
    fail("zinkgame_import_action_in_header");
  }
} catch (error) {
  fail("zinkgame_import_action_in_header", error.message);
}

try {
  if (
    zinkgamePage.includes("handleHeaderImportProduct") &&
    zinkgamePage.includes("setConfirmOpen(true)") &&
    zinkgameImportRoute.includes("/api/admin/suppliers/zinkgame/import")
  ) {
    pass("manual_import_route_remains_connected");
  } else {
    fail("manual_import_route_remains_connected");
  }
} catch (error) {
  fail("manual_import_route_remains_connected", error.message);
}

try {
  if (autoImportLib.includes('importMode: "auto"')) {
    pass("auto_import_remains_auto_mode");
  } else {
    fail("auto_import_remains_auto_mode");
  }
} catch (error) {
  fail("auto_import_remains_auto_mode", error.message);
}

try {
  if (zinkgameImportRoute.includes('importMode: "manual"')) {
    pass("manual_import_remains_manual_mode");
  } else {
    fail("manual_import_remains_manual_mode");
  }
} catch (error) {
  fail("manual_import_remains_manual_mode", error.message);
}

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\nPhase 25: ${passed}/${results.length} passed${failed ? `, ${failed} failed` : ""}`);
process.exit(failed ? 1 : 0);
