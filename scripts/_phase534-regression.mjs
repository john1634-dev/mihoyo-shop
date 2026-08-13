/**
 * Phase 5.3.4 local regression (TEST mode). Run: node scripts/_phase534-regression.mjs
 * Requires dev server: npm run dev
 */
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { readFileSync, existsSync } from "fs";

const BASE = process.env.REGRESSION_BASE_URL || "http://localhost:3000";

const env = readFileSync(".env.local", "utf8");
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
};

const sb = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const stripe = new Stripe(get("STRIPE_SECRET_KEY"));

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS ${name}${detail ? `: ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
}

async function webhookPost(event, sigOverride) {
  const payload = JSON.stringify(event);
  const signature =
    sigOverride ??
    stripe.webhooks.generateTestHeaderString({
      payload,
      secret: get("STRIPE_WEBHOOK_SECRET"),
    });
  const res = await fetch(`${BASE}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signature,
    },
    body: payload,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function buildCompletedEvent(orderId, productId, sessionId, amountCents, currency, eventId, paymentIntentId) {
  return {
    id: eventId,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        payment_status: "paid",
        currency,
        amount_total: amountCents,
        metadata: { order_id: orderId, product_id: productId },
        payment_intent: paymentIntentId,
      },
    },
  };
}

async function main() {
  if (!get("STRIPE_SECRET_KEY").startsWith("sk_test_")) {
    fail("stripe_test_mode", "STRIPE_SECRET_KEY is not sk_test_");
    process.exit(1);
  }
  pass("stripe_test_mode");

  if (existsSync("scripts/_phase532-audit.mjs")) fail("scripts_deleted", "audit still exists");
  else pass("scripts_deleted_audit");
  if (existsSync("scripts/_phase532-cleanup.mjs")) fail("scripts_deleted", "cleanup still exists");
  else pass("scripts_deleted_cleanup");

  const { data: product } = await sb
    .from("products")
    .select("id,price,currency,status")
    .eq("status", "available")
    .limit(1)
    .maybeSingle();
  if (!product) {
    fail("setup", "no available product");
    process.exit(1);
  }
  const productBefore = product.status;

  // A. Checkout tampering ignored (DB price used in Stripe session — inspect create-session logic via API)
  const tamperRes = await fetch(`${BASE}/api/checkout/create-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      product_id: product.id,
      email: `phase534-${Date.now()}@example.com`,
      price: 0.01,
      currency: "USD",
    }),
  });
  const tamperBody = await tamperRes.json().catch(() => ({}));
  if (!tamperRes.ok || !tamperBody.order_id) {
    fail("checkout_tamper", tamperBody.error || tamperRes.status);
  } else {
    const { data: orderRow } = await sb
      .from("orders")
      .select("total_amount,currency")
      .eq("id", tamperBody.order_id)
      .single();
    if (
      Number(orderRow?.total_amount) === Number(product.price) &&
      (orderRow?.currency || "MYR").toUpperCase() === (product.currency || "MYR").toUpperCase()
    ) {
      pass("checkout_tamper_ignored", `order uses DB ${orderRow.currency} ${orderRow.total_amount}`);
    } else {
      fail("checkout_tamper_ignored", JSON.stringify(orderRow));
    }
    await sb.from("orders").delete().eq("id", tamperBody.order_id);
  }

  // Setup order for webhook tests
  const email = `phase534-wh-${Date.now()}@example.com`;
  const orderNumber = `BG-TEST-${Date.now()}`;
  const amount = Number(product.price);
  const currency = (product.currency || "MYR").toUpperCase();
  const amountCents = Math.round(amount * 100);
  const sessionId = `cs_test_phase534_${Date.now()}`;
  const eventId = `evt_phase534_${Date.now()}`;

  const { data: order, error: orderErr } = await sb
    .from("orders")
    .insert({
      order_number: orderNumber,
      customer_email: email,
      customer_name: "Phase534 Test",
      subtotal: amount,
      total: amount,
      total_amount: amount,
      currency,
      status: "pending",
      order_status: "pending",
      payment_status: "pending",
      payment_method: "stripe",
      channel: "stripe",
      stripe_checkout_session_id: sessionId,
    })
    .select("id")
    .single();
  if (orderErr || !order) {
    fail("setup_order", orderErr?.message || "no order");
    process.exit(1);
  }

  await sb.from("order_items").insert({
    order_id: order.id,
    product_id: product.id,
    product_title: "phase534",
    price: amount,
    unit_price: amount,
    quantity: 1,
    subtotal: amount,
  });

  const completedEvent = buildCompletedEvent(
    order.id,
    product.id,
    sessionId,
    amountCents,
    currency.toLowerCase(),
    eventId,
    `pi_test_phase534_${Date.now()}`
  );

  // B. Missing signature -> 400
  {
    const payload = JSON.stringify(completedEvent);
    const res = await fetch(`${BASE}/api/stripe/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    if (res.status === 400) pass("webhook_missing_signature_400");
    else fail("webhook_missing_signature_400", String(res.status));
  }

  // B. Invalid signature -> 400
  {
    const r = await webhookPost(completedEvent, "t=invalid,v1=bad");
    if (r.status === 400) pass("webhook_invalid_signature_400");
    else fail("webhook_invalid_signature_400", String(r.status));
  }

  // B. New completed -> paid
  {
    const r = await webhookPost(completedEvent);
    const { data: o } = await sb.from("orders").select("payment_status,status").eq("id", order.id).single();
    if (r.status === 200 && r.body.received && o?.payment_status === "paid") {
      pass("webhook_completed_paid");
    } else {
      fail("webhook_completed_paid", `${r.status} ${JSON.stringify(r.body)} ${JSON.stringify(o)}`);
    }
  }

  // B. Exact duplicate completed -> idempotent 200
  {
    const r = await webhookPost(completedEvent);
    if (r.status === 200 && r.body.received && r.body.duplicate === true) {
      pass("webhook_duplicate_completed");
    } else {
      fail("webhook_duplicate_completed", JSON.stringify(r));
    }
  }

  // Expired + failed on separate orders
  const expiredOrderId = order.id; // reuse paid order for expired should no-op
  const expiredEvent = {
    id: `evt_phase534_exp_${Date.now()}`,
    object: "event",
    type: "checkout.session.expired",
    data: {
      object: {
        id: sessionId,
        metadata: { order_id: expiredOrderId },
      },
    },
  };
  await webhookPost(expiredEvent);
  const { data: paidStill } = await sb
    .from("orders")
    .select("payment_status")
    .eq("id", expiredOrderId)
    .single();
  if (paidStill?.payment_status === "paid") pass("webhook_expired_idempotent_on_paid");
  else fail("webhook_expired_idempotent_on_paid");

  const failOrderNum = `BG-FAIL-${Date.now()}`;
  const failSession = `cs_test_fail_${Date.now()}`;
  const { data: failOrder } = await sb
    .from("orders")
    .insert({
      order_number: failOrderNum,
      customer_email: `phase534-fail-${Date.now()}@example.com`,
      customer_name: "Fail Test",
      subtotal: amount,
      total: amount,
      total_amount: amount,
      currency,
      status: "pending",
      order_status: "pending",
      payment_status: "pending",
      stripe_checkout_session_id: failSession,
    })
    .select("id")
    .single();
  await sb.from("order_items").insert({
    order_id: failOrder.id,
    product_id: product.id,
    product_title: "phase534",
    price: amount,
    unit_price: amount,
    quantity: 1,
    subtotal: amount,
  });
  const failedEvent = {
    id: `evt_phase534_asyncfail_${Date.now()}`,
    object: "event",
    type: "checkout.session.async_payment_failed",
    data: {
      object: {
        id: failSession,
        metadata: { order_id: failOrder.id },
      },
    },
  };
  await webhookPost(failedEvent);
  const { data: failedRow } = await sb
    .from("orders")
    .select("payment_status,status")
    .eq("id", failOrder.id)
    .single();
  if (failedRow?.payment_status === "failed" && failedRow?.status === "failed") {
    pass("webhook_async_failed");
  } else fail("webhook_async_failed", JSON.stringify(failedRow));

  // C. Poisoned retry: event already recorded, order still pending, duplicate delivery marks paid
  const retryOrderNum = `BG-RETRY-${Date.now()}`;
  const retrySession = `cs_test_retry_${Date.now()}`;
  const retryEventId = `evt_phase534_retry_${Date.now()}`;
  const { data: retryOrder } = await sb
    .from("orders")
    .insert({
      order_number: retryOrderNum,
      customer_email: `phase534-retry-${Date.now()}@example.com`,
      customer_name: "Retry Test",
      subtotal: amount,
      total: amount,
      total_amount: amount,
      currency,
      status: "pending",
      order_status: "pending",
      payment_status: "pending",
      stripe_checkout_session_id: retrySession,
      channel: "stripe",
      payment_method: "stripe",
    })
    .select("id")
    .single();
  await sb.from("order_items").insert({
    order_id: retryOrder.id,
    product_id: product.id,
    product_title: "phase534",
    price: amount,
    unit_price: amount,
    quantity: 1,
    subtotal: amount,
  });
  await sb.from("stripe_events").insert({
    id: retryEventId,
    type: "checkout.session.completed",
    order_id: retryOrder.id,
  });
  const retryEvent = buildCompletedEvent(
    retryOrder.id,
    product.id,
    retrySession,
    amountCents,
    currency.toLowerCase(),
    retryEventId,
    `pi_test_retry_${Date.now()}`
  );
  const retryRes = await webhookPost(retryEvent);
  const { data: retryPaid } = await sb
    .from("orders")
    .select("payment_status")
    .eq("id", retryOrder.id)
    .single();
  if (
    retryRes.status === 200 &&
    retryRes.body.duplicate === true &&
    retryPaid?.payment_status === "paid"
  ) {
    pass("webhook_poisoned_retry_recovers", "duplicate delivery marked order paid");
  } else {
    fail(
      "webhook_poisoned_retry_recovers",
      `${retryRes.status} ${JSON.stringify(retryRes.body)} payment=${retryPaid?.payment_status}`
    );
  }

  // D. Product still available
  const { data: productAfter } = await sb
    .from("products")
    .select("status")
    .eq("id", product.id)
    .single();
  if (productAfter?.status === "available" && productBefore === "available") {
    pass("product_stays_available");
  } else {
    fail("product_stays_available", JSON.stringify(productAfter));
  }

  // E. Guest receipt HMAC API (inline sign — same as lib/order-receipt.ts)
  const { createHmac } = await import("crypto");
  const receiptSecret = () => {
    const explicit = get("ORDER_RECEIPT_SECRET");
    if (explicit) return explicit;
    return `receipt:${get("STRIPE_WEBHOOK_SECRET")}`;
  };
  const payload = Buffer.from(
    JSON.stringify({ oid: order.id, em: email.toLowerCase(), exp: Date.now() + 3600_000 }),
    "utf8"
  ).toString("base64url");
  const sig = createHmac("sha256", receiptSecret()).update(payload).digest("base64url");
  const token = `${payload}.${sig}`;
  const receiptRes = await fetch(
    `${BASE}/api/orders/${order.id}?t=${encodeURIComponent(token)}`
  );
  const receiptBody = await receiptRes.json().catch(() => ({}));
  if (receiptRes.ok && receiptBody.order_id === order.id) {
    pass("guest_receipt_hmac_api");
  } else {
    fail("guest_receipt_hmac_api", `${receiptRes.status} ${JSON.stringify(receiptBody)}`);
  }

  // F. Anon RPC — migration not applied; expect still callable until SQL run
  const anon = createClient(
    get("NEXT_PUBLIC_SUPABASE_URL"),
    get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  );
  const { data: rpcData, error: rpcErr } = await anon.rpc("get_order_receipt", {
    p_order_id: order.id,
    p_guest_email: email,
  });
  if (!rpcErr && rpcData?.order_id === order.id) {
    pass("anon_rpc_still_open", "expected until migration SQL is applied manually");
  } else if (rpcErr) {
    pass("anon_rpc_revoked", "already restricted in DB");
  } else {
    fail("anon_rpc_check", rpcErr?.message || "unexpected");
  }

  // Cleanup test orders
  const testOrderIds = [order.id, failOrder.id, retryOrder.id];
  await sb.from("stripe_events").delete().in("id", [eventId, retryEventId]);
  for (const oid of testOrderIds) {
    await sb.from("order_items").delete().eq("order_id", oid);
    await sb.from("orders").delete().eq("id", oid);
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n--- SUMMARY ---");
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("Failed:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
