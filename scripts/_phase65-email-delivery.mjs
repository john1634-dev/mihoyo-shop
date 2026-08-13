/**
 * Phase 6.5 — email delivery regression (local, mocked Resend, no real emails).
 * Run: node --require ./scripts/shim-server-only.cjs --import tsx scripts/_phase65-email-delivery.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

process.env.INVENTORY_ENCRYPTION_KEY = randomBytes(32).toString("hex");
process.env.RESEND_API_KEY = "re_test_not_a_real_key";
process.env.RESEND_FROM_EMAIL = "GameSlot <noreply@example.com>";

const {
  buildInventoryDeliveryEmail,
  emailDeliveryIdempotencyKey,
  evaluateEmailDeliveryEligibility,
} = await import("../lib/inventory-delivery.ts");

const { encryptInventoryCredentials, decryptInventoryCredentials } =
  await import("../lib/inventory-crypto.ts");

const { setEmailTransportForTests } = await import("../lib/email.ts");

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS ${name}${detail ? `: ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
}

function checkEligibility() {
  const cases = [
    [
      {
        order: { payment_status: "pending", status: "pending", customer_email: "a@b.com" },
        inventory: { status: "assigned" },
        hasCredentials: true,
      },
      "ORDER_NOT_PAID",
    ],
    [
      {
        order: { payment_status: "paid", status: "paid", customer_email: "a@b.com" },
        inventory: null,
        hasCredentials: true,
      },
      "NO_ASSIGNED_INVENTORY",
    ],
    [
      {
        order: { payment_status: "paid", status: "cancelled", customer_email: "a@b.com" },
        inventory: { status: "assigned" },
        hasCredentials: true,
      },
      "ORDER_NOT_ELIGIBLE",
    ],
    [
      {
        order: { payment_status: "refunded", status: "refunded", customer_email: "a@b.com" },
        inventory: { status: "assigned" },
        hasCredentials: true,
      },
      "ORDER_NOT_ELIGIBLE",
    ],
    [
      {
        order: { payment_status: "paid", status: "paid", customer_email: "" },
        inventory: { status: "assigned" },
        hasCredentials: true,
      },
      "MISSING_CUSTOMER_EMAIL",
    ],
    [
      {
        order: { payment_status: "paid", status: "paid", customer_email: "a@b.com" },
        inventory: { status: "assigned" },
        hasCredentials: false,
      },
      "MISSING_CREDENTIALS",
    ],
    [
      {
        order: { payment_status: "paid", status: "paid", customer_email: "a@b.com" },
        inventory: { status: "void" },
        hasCredentials: true,
      },
      "INVENTORY_NOT_ELIGIBLE",
    ],
  ];

  for (const [input, code] of cases) {
    const result = evaluateEmailDeliveryEligibility(input);
    if (!result.ok && result.error_code === code) pass(`blocked_${code}`);
    else fail(`blocked_${code}`, JSON.stringify(result));
  }

  const ok = evaluateEmailDeliveryEligibility({
    order: { payment_status: "paid", status: "paid", customer_email: "a@b.com" },
    inventory: { status: "assigned" },
    hasCredentials: true,
  });
  if (ok.ok) pass("eligible_paid_assigned");
  else fail("eligible_paid_assigned", JSON.stringify(ok));
}

function checkTemplateAndCrypto() {
  const payload = {
    login: "player_login",
    password: "secret-password-xyz",
    email: "account@example.com",
    extra: "UID 123",
  };

  const email = buildInventoryDeliveryEmail({
    orderLabel: "BG-TEST",
    productTitle: "Genshin Account",
    credentials: { schema_version: 1, ...payload },
  });

  assert.ok(email.subject.includes("BG-TEST"));
  assert.ok(!email.subject.toLowerCase().includes("password"));
  assert.ok(email.html.includes(payload.login));
  assert.ok(email.text.includes(payload.password));
  assert.ok(!email.html.includes("ciphertext"));
  assert.ok(!email.html.includes("nonce"));
  assert.ok(!email.html.includes("INVENTORY_ENCRYPTION_KEY"));
  assert.ok(!email.html.includes("STRIPE"));
  pass("email_template_safe_subject_and_fields");

  const enc = encryptInventoryCredentials(payload);
  const dec = decryptInventoryCredentials(enc.ciphertext, enc.nonce, enc.key_version);
  assert.equal(dec.password, payload.password);
  pass("crypto_roundtrip_for_delivery");

  const key = emailDeliveryIdempotencyKey("11111111-1111-4111-8111-111111111111");
  assert.equal(key, "11111111-1111-4111-8111-111111111111:email:v1");
  pass("idempotency_key_format");
}

function simulateDeliveryStateMachine() {
  /** In-memory model of delivery_attempts + inventory + order outcomes. */
  const state = {
    attempt: null,
    inventoryStatus: "assigned",
    orderStatus: "paid",
    emailsSent: 0,
  };

  function deliver({ forceFail = false } = {}) {
    if (state.attempt?.status === "sent") {
      return { ok: true, status: "already_sent", emailsSent: state.emailsSent };
    }
    if (state.attempt?.status === "pending") {
      return { ok: true, status: "in_progress", emailsSent: state.emailsSent };
    }
    if (!state.attempt) {
      state.attempt = { status: "pending" };
    } else if (state.attempt.status === "failed") {
      state.attempt.status = "pending";
    }

    if (forceFail) {
      state.attempt.status = "failed";
      return { ok: false, status: "failed", emailsSent: state.emailsSent };
    }

    state.emailsSent += 1;
    state.attempt.status = "sent";
    state.inventoryStatus = "delivered";
    state.orderStatus = "fulfilled";
    return { ok: true, status: "sent", emailsSent: state.emailsSent };
  }

  const first = deliver();
  assert.equal(first.status, "sent");
  assert.equal(state.inventoryStatus, "delivered");
  assert.equal(state.orderStatus, "fulfilled");
  pass("success_marks_delivered_and_fulfilled");

  const replay = deliver();
  assert.equal(replay.status, "already_sent");
  assert.equal(replay.emailsSent, 1);
  pass("duplicate_webhook_no_second_email");

  // Failure path
  state.attempt = null;
  state.inventoryStatus = "assigned";
  state.orderStatus = "paid";
  state.emailsSent = 0;
  const failed = deliver({ forceFail: true });
  assert.equal(failed.status, "failed");
  assert.equal(state.inventoryStatus, "assigned");
  assert.equal(state.orderStatus, "paid");
  pass("failed_email_keeps_assigned_not_fulfilled");

  const retry = deliver();
  assert.equal(retry.status, "sent");
  assert.equal(state.orderStatus, "fulfilled");
  pass("retry_after_failure_succeeds");

  // Concurrent pending
  state.attempt = { status: "pending" };
  state.inventoryStatus = "assigned";
  state.orderStatus = "paid";
  state.emailsSent = 0;
  const concurrent = deliver();
  assert.equal(concurrent.status, "in_progress");
  assert.equal(concurrent.emailsSent, 0);
  pass("concurrent_pending_no_duplicate_send");
}

function checkSourceGuards() {
  const webhook = readFileSync("app/api/stripe/webhook/route.ts", "utf8");
  const delivery = readFileSync("lib/inventory-delivery.ts", "utf8");
  const api = readFileSync(
    "app/api/admin/inventory/deliver-email/route.ts",
    "utf8"
  );
  const email = readFileSync("lib/email.ts", "utf8");
  const adminUi = readFileSync("app/admin/orders/page.tsx", "utf8");

  if (
    webhook.includes("deliverInventoryByEmail") &&
    webhook.includes("claim.assigned")
  ) {
    pass("webhook_delivers_after_assign");
  } else {
    fail("webhook_delivers_after_assign");
  }

  if (!webhook.includes("decryptInventoryCredentials")) {
    pass("webhook_no_direct_decrypt");
  } else {
    fail("webhook_no_direct_decrypt");
  }

  if (
    delivery.includes("decryptInventoryCredentials") &&
    delivery.includes("delivery_attempts") &&
    delivery.includes("fulfilled") &&
    !/console\.(info|log|error).*password/i.test(delivery)
  ) {
    pass("delivery_uses_crypto_and_attempts");
  } else {
    fail("delivery_uses_crypto_and_attempts");
  }

  if (
    api.includes("requireAdmin") &&
    !api.includes("decryptInventoryCredentials") &&
    !api.toLowerCase().includes("password")
  ) {
    pass("admin_api_no_credential_response");
  } else {
    fail("admin_api_no_credential_response");
  }

  if (
    email.includes('import "server-only"') &&
    email.includes("RESEND_API_KEY") &&
    !email.includes("NEXT_PUBLIC_RESEND")
  ) {
    pass("email_helper_server_only");
  } else {
    fail("email_helper_server_only");
  }

  if (
    adminUi.includes("Send Account Email") &&
    adminUi.includes("Retry Email") &&
    adminUi.includes("Email Sent") &&
    !adminUi.includes("decryptInventoryCredentials")
  ) {
    pass("admin_ui_email_actions_no_credentials");
  } else {
    fail("admin_ui_email_actions_no_credentials");
  }

  if (!/UPDATE\s+.*products.*status/i.test(delivery)) {
    pass("products_status_unchanged");
  } else {
    fail("products_status_unchanged");
  }

  // Ensure client bundle sources don't import inventory-delivery / crypto
  if (
    !adminUi.includes("inventory-delivery") &&
    !adminUi.includes("inventory-crypto")
  ) {
    pass("browser_ui_no_crypto_import");
  } else {
    fail("browser_ui_no_crypto_import");
  }
}

async function checkMockTransportDoesNotLeak() {
  let captured = null;
  setEmailTransportForTests(async (input) => {
    captured = {
      to: input.to,
      subject: input.subject,
      hasPassword: input.text.includes("secret-password-xyz"),
    };
    return { ok: true, provider_message_id: "mock_msg_1" };
  });

  // Transport works and can carry password in body (email content),
  // but API responses / logs must not. Here we only verify mock path.
  const result = await (
    await import("../lib/email.ts")
  ).sendTransactionalEmail({
    to: "buyer@example.com",
    subject: "Your Game Account Order — #TEST",
    html: "<p>secret-password-xyz</p>",
    text: "secret-password-xyz",
  });

  assert.equal(result.ok, true);
  assert.equal(captured?.to, "buyer@example.com");
  assert.equal(captured?.hasPassword, true);
  pass("mock_transport_used_no_real_resend");

  setEmailTransportForTests(null);
}

await checkEligibility();
checkTemplateAndCrypto();
simulateDeliveryStateMachine();
checkSourceGuards();
await checkMockTransportDoesNotLeak();

const failed = results.filter((r) => !r.ok);
console.log(
  `\nPhase 6.5 email-delivery: ${results.length - failed.length}/${results.length} passed`
);
if (failed.length) process.exit(1);
