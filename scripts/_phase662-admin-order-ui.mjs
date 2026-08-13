/**
 * Phase 6.6 Step 2 — admin order detail UI visibility tests.
 * Run: node --import tsx scripts/_phase662-admin-order-ui.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const {
  orderNeedsManualAccount,
  showManualFulfillForm,
  showRetryEmailAction,
  showEmailSentState,
  mapManualFulfillError,
  EMPTY_MANUAL_FULFILL_FORM,
} = await import("../lib/admin-order-fulfillment-ui.ts");

const results = [];

function pass(name) {
  results.push({ name, ok: true });
  console.log(`PASS ${name}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false });
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
}

const paidNoInventory = {
  payment_status: "paid",
  status: "paid",
  inventory: { exists: false },
  email_delivery: { status: null },
};

if (showManualFulfillForm(paidNoInventory)) pass("manual_form_paid_no_inventory");
else fail("manual_form_paid_no_inventory");

if (orderNeedsManualAccount(paidNoInventory)) pass("badge_needs_manual");
else fail("badge_needs_manual");

if (!showManualFulfillForm({ payment_status: "pending", status: "pending", inventory: { exists: false }, email_delivery: null }))
  pass("manual_form_hidden_unpaid");
else fail("manual_form_hidden_unpaid");

if (!showManualFulfillForm({ payment_status: "paid", status: "cancelled", inventory: { exists: false }, email_delivery: null }))
  pass("manual_form_hidden_cancelled");
else fail("manual_form_hidden_cancelled");

if (!showManualFulfillForm({ payment_status: "paid", status: "refunded", inventory: { exists: false }, email_delivery: null }))
  pass("manual_form_hidden_refunded");
else fail("manual_form_hidden_refunded");

if (
  showRetryEmailAction({
    inventory: { exists: true, status: "assigned" },
    email_delivery: { status: "failed" },
    status: "paid",
  })
)
  pass("retry_email_visible");
else fail("retry_email_visible");

if (
  !showManualFulfillForm({
    payment_status: "paid",
    status: "paid",
    inventory: { exists: true, status: "assigned" },
    email_delivery: { status: "failed" },
  })
)
  pass("manual_form_hidden_when_inventory_assigned");
else fail("manual_form_hidden_when_inventory_assigned");

if (
  !showManualFulfillForm({
    payment_status: "paid",
    status: "fulfilled",
    inventory: { exists: true, status: "delivered" },
    email_delivery: { status: "sent" },
  }) &&
  showEmailSentState({
    status: "fulfilled",
    email_delivery: { status: "sent" },
  })
)
  pass("email_sent_hides_manual_form");
else fail("email_sent_hides_manual_form");

assert.deepEqual(EMPTY_MANUAL_FULFILL_FORM, {
  login: "",
  password: "",
  email: "",
  extra: "",
});
pass("empty_form_clears_credentials");

const err = mapManualFulfillError("INVENTORY_ALREADY_ASSIGNED");
assert.ok(!err.toLowerCase().includes("password"));
pass("error_mapping_no_credentials");

function checkSources() {
  const detailPage = readFileSync("app/admin/orders/[id]/page.tsx", "utf8");
  const getApi = readFileSync("app/api/admin/orders/[id]/route.ts", "utf8");
  const listPage = readFileSync("app/admin/orders/page.tsx", "utf8");

  if (
    detailPage.includes("manual-fulfill") &&
    detailPage.includes("deliver-email") &&
    detailPage.includes("EMPTY_MANUAL_FULFILL_FORM") &&
    !detailPage.includes("console.log")
  ) {
    pass("detail_page_wiring");
  } else {
    fail("detail_page_wiring");
  }

  if (
    getApi.includes("requireAdmin") &&
    !getApi.includes("inventory_credentials") &&
    !getApi.includes("ciphertext") &&
    !getApi.includes("decrypt")
  ) {
    pass("get_api_safe_response");
  } else {
    fail("get_api_safe_response");
  }

  if (
    listPage.includes("View / Fulfill") &&
    listPage.includes("Needs Manual Account")
  ) {
    pass("list_page_links_and_badge");
  } else {
    fail("list_page_links_and_badge");
  }

  if (detailPage.includes('type="password"') && detailPage.includes('autoComplete="new-password"')) {
    pass("password_input_secure");
  } else {
    fail("password_input_secure");
  }

  if (detailPage.includes("disabled={submitting")) {
    pass("double_submit_guard");
  } else {
    fail("double_submit_guard");
  }
}

checkSources();

const failed = results.filter((r) => !r.ok);
console.log(
  `\nPhase 6.6 Step 2 admin-order-ui: ${results.length - failed.length}/${results.length} passed`
);
if (failed.length) process.exit(1);
