import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { assignInventoryAfterPayment } from "@/lib/inventory-assign";
import { deliverInventoryByEmail } from "@/lib/inventory-delivery";
import { orderAmount, orderCurrency } from "@/lib/orders";
import {
  fromStripeUnitAmount,
  getStripe,
  getStripeWebhookSecret,
} from "@/lib/stripe";
import { getSupabaseService } from "@/lib/supabase-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function recordStripeEvent(input: {
  id: string;
  type: string;
  orderId?: string | null;
}): Promise<"new" | "duplicate" | "skipped"> {
  const service = getSupabaseService();
  const { error } = await service.from("stripe_events").insert({
    id: input.id,
    type: input.type,
    order_id: input.orderId ?? null,
  });

  if (!error) return "new";

  // Unique violation first — duplicate Stripe event (idempotent replay).
  // Must run before missing-table heuristics: Postgres unique errors often
  // include the table/constraint name (e.g. stripe_events_pkey).
  if (error.code === "23505" || /duplicate key|unique constraint/i.test(error.message)) {
    return "duplicate";
  }

  // Table truly missing / PostgREST schema cache miss — soft-skip only.
  // Do NOT match bare "stripe_events" (that also appears in unique errors).
  if (
    error.code === "PGRST205" ||
    /Could not find the table ['"]public\.stripe_events['"]/i.test(error.message) ||
    (/schema cache/i.test(error.message) && /stripe_events/i.test(error.message))
  ) {
    return "skipped";
  }

  console.error("[stripe.webhook] stripe_events insert:", error.message);
  return "skipped";
}

async function loadOrderById(orderId: string) {
  const service = getSupabaseService();
  const { data, error } = await service
    .from("orders")
    .select(
      "id,status,order_status,payment_status,currency,total_amount,total,subtotal,stripe_checkout_session_id,stripe_payment_intent_id"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

function sessionAmountMajor(session: Stripe.Checkout.Session): number | null {
  if (session.amount_total == null || !session.currency) return null;
  return fromStripeUnitAmount(session.amount_total, session.currency);
}

function orderIsPaid(order: {
  payment_status?: string | null;
  status?: string | null;
  order_status?: string | null;
}): boolean {
  if (order.payment_status === "paid") return true;
  const status = (order.status || order.order_status || "").toLowerCase();
  return (
    status === "paid" ||
    status === "sourcing" ||
    status === "fulfilled" ||
    status === "processing" ||
    status === "completed"
  );
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id?.trim();
  const productId = session.metadata?.product_id?.trim();

  if (!orderId || !productId) {
    console.error("[stripe.webhook] missing metadata on session", session.id);
    return;
  }

  if (session.payment_status !== "paid") {
    console.error(
      "[stripe.webhook] session not paid",
      session.id,
      session.payment_status
    );
    return;
  }

  const order = await loadOrderById(orderId);
  if (!order) {
    console.error("[stripe.webhook] order not found", orderId);
    return;
  }

  if (
    order.stripe_checkout_session_id &&
    order.stripe_checkout_session_id !== session.id
  ) {
    console.error("[stripe.webhook] session mismatch", orderId);
    return;
  }

  const paidAmount = sessionAmountMajor(session);
  const expectedAmount = orderAmount(order);
  const expectedCurrency = orderCurrency(order).toLowerCase();
  const sessionCurrency = (session.currency || "").toLowerCase();

  if (
    paidAmount == null ||
    Math.abs(paidAmount - expectedAmount) > 0.001 ||
    sessionCurrency !== expectedCurrency
  ) {
    console.error("[stripe.webhook] amount/currency mismatch", {
      orderId,
      expectedAmount,
      paidAmount,
      expectedCurrency,
      sessionCurrency,
    });
    return;
  }

  // Verify line item product via metadata only (single-item checkout)
  const service = getSupabaseService();
  const { data: items } = await service
    .from("order_items")
    .select("product_id")
    .eq("order_id", orderId);

  const itemProductIds = (items || []).map((i) => i.product_id).filter(Boolean);
  if (!itemProductIds.includes(productId)) {
    console.error("[stripe.webhook] product_id metadata mismatch", orderId);
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;

  // Mark paid unless already paid (duplicate / replay still continues to claim).
  if (!orderIsPaid(order)) {
    const { data: rpcResult, error: rpcError } = await service.rpc(
      "mark_stripe_payment_paid",
      {
        p_order_id: orderId,
        p_checkout_session_id: session.id,
        p_payment_intent_id: paymentIntentId,
        p_amount_total: expectedAmount,
        p_currency: orderCurrency(order),
      }
    );

    if (rpcError) {
      const { error: updateError } = await service
        .from("orders")
        .update({
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: paymentIntentId,
          payment_status: "paid",
          status: "paid",
          order_status: "paid",
          payment_method: "stripe",
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .neq("payment_status", "paid");

      if (updateError) {
        if (/paid_at|column/i.test(updateError.message)) {
          const { error: retryError } = await service
            .from("orders")
            .update({
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: paymentIntentId,
              payment_status: "paid",
              status: "paid",
              order_status: "paid",
              payment_method: "stripe",
              updated_at: new Date().toISOString(),
            })
            .eq("id", orderId)
            .neq("payment_status", "paid");

          if (retryError) {
            console.error(
              "[stripe.webhook] paid update failed:",
              retryError.message
            );
          }
        } else {
          console.error(
            "[stripe.webhook] paid update failed:",
            updateError.message
          );
        }
      }
    } else {
      console.info("[stripe.webhook] mark paid", rpcResult);
    }
  }

  const verified = await loadOrderById(orderId);
  if (!verified || !orderIsPaid(verified)) {
    throw new Error(
      `[stripe.webhook] order ${orderId} not marked paid after checkout.session.completed`
    );
  }

  // Phase 6.4 — assign inventory after payment only.
  // Idempotent claim; no-stock leaves order paid for manual sourcing.
  // Does NOT mark product sold, fulfill, decrypt credentials, or send delivery yet.
  const claim = await assignInventoryAfterPayment({
    orderId,
    productId,
  });

  // Phase 6.5 — email delivery only after successful assignment.
  // Idempotent via delivery_attempts. Failures leave inventory assigned for retry.
  if (claim.assigned) {
    await deliverInventoryByEmail(orderId);
  }
}

async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id?.trim();
  if (!orderId) return;

  const service = getSupabaseService();
  const { error } = await service.rpc("mark_stripe_checkout_expired", {
    p_order_id: orderId,
    p_checkout_session_id: session.id,
  });

  if (error) {
    const order = await loadOrderById(orderId);
    if (!order || order.payment_status === "paid") return;

    await service
      .from("orders")
      .update({
        status: "cancelled",
        order_status: "cancelled",
        payment_status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .neq("payment_status", "paid");
  }
}

async function handlePaymentFailed(sessionLike: {
  metadata?: Stripe.Metadata | null;
  id?: string;
}) {
  const orderId = sessionLike.metadata?.order_id?.trim();
  if (!orderId) return;

  const order = await loadOrderById(orderId);
  if (!order || order.payment_status === "paid") return;

  const service = getSupabaseService();
  await service
    .from("orders")
    .update({
      payment_status: "failed",
      status: "failed",
      order_status: "failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .neq("payment_status", "paid");
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      getStripeWebhookSecret()
    );
  } catch (error) {
    console.error(
      "[stripe.webhook] signature verification failed:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const orderIdFromEvent =
    event.type.startsWith("checkout.session.")
      ? ((event.data.object as Stripe.Checkout.Session).metadata?.order_id ??
        null)
      : null;

  const eventState = await recordStripeEvent({
    id: event.id,
    type: event.type,
    orderId: orderIdFromEvent,
  });

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;
      case "checkout.session.expired":
        await handleCheckoutExpired(
          event.data.object as Stripe.Checkout.Session
        );
        break;
      case "checkout.session.async_payment_failed":
        await handlePaymentFailed(
          event.data.object as Stripe.Checkout.Session
        );
        break;
      default:
        break;
    }
  } catch (error) {
    console.error(
      "[stripe.webhook] handler error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({
    received: true,
    ...(eventState === "duplicate" ? { duplicate: true } : {}),
  });
}
