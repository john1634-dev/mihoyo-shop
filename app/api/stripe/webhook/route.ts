import { NextResponse } from "next/server";
import Stripe from "stripe";
import { logServerError, toUserError } from "@/lib/errors";
import { notifyPaymentConfirmed } from "@/lib/email";
import { getSupabaseService } from "@/lib/supabase-service";

type MarkStripePaidEmailItem = {
  title: string;
  price: number;
  quantity: number;
};

type MarkStripePaidEmailPayload = {
  customerName: string | null;
  customerEmail: string | null;
  orderNumber: string;
  orderId: string;
  status: string;
  paymentStatus: string;
  total: number;
  currency: string;
  createdAt: string | null;
  items: MarkStripePaidEmailItem[];
};

type MarkStripePaidRpcResult = {
  updated: boolean;
  email?: MarkStripePaidEmailPayload;
};

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

function getStripe(): Stripe {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }
  return new Stripe(STRIPE_SECRET_KEY);
}

function wlog(step: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  const ts = new Date().toISOString();
  if (data) {
    console.log(`[Webhook] ${ts} ${step}`, JSON.stringify(data));
  } else {
    console.log(`[Webhook] ${ts} ${step}`);
  }
}

export async function POST(request: Request) {
  try {
    if (!STRIPE_WEBHOOK_SECRET) {
      wlog("ERROR: Missing STRIPE_WEBHOOK_SECRET");
      return NextResponse.json(
        { error: "Missing STRIPE_WEBHOOK_SECRET" },
        { status: 500 }
      );
    }

    const sig = request.headers.get("stripe-signature");
    if (!sig) {
      wlog("ERROR: Missing stripe-signature header");
      return NextResponse.json({ error: "Missing stripe signature" }, { status: 400 });
    }

    const payload = await request.text();

    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(
      payload,
      sig,
      STRIPE_WEBHOOK_SECRET
    );

    wlog("signature_verified", { event_id: event.id, event_type: event.type });

    // Stripe Checkout Session is the main object for these events.
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.order_id;
    const checkoutSessionId = session.id;

    wlog("session_parsed", {
      event_id: event.id,
      event_type: event.type,
      checkout_session_id: checkoutSessionId,
      order_id: orderId ?? null,
      payment_status: session.payment_status,
      amount_total_cents: session.amount_total,
      currency: session.currency,
    });

    if (!orderId || !checkoutSessionId) {
      wlog("ERROR: missing order_id or checkout_session_id — returning 200 to skip retry", {
        checkout_session_id: checkoutSessionId,
        order_id: orderId ?? null,
      });
      // Return 200: this is a Stripe session without our metadata (e.g. a test
      // event fired from the Stripe dashboard). Retrying won't help.
      return NextResponse.json({ ok: true, skipped: "missing_metadata" });
    }

    const amountMajor = session.amount_total
      ? Number(session.amount_total) / 100
      : 0;
    const currencyUpper = (session.currency || "MYR").toUpperCase();

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id || "";

    // ── Successful payment ────────────────────────────────────────────────────
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      if (session.payment_status !== "paid") {
        // checkout.session.completed fires for async methods before payment
        // clears; wait for async_payment_succeeded instead.
        wlog("payment_not_yet_paid — skipping mark_paid", {
          event_type: event.type,
          payment_status: session.payment_status,
          order_id: orderId,
        });
        return NextResponse.json({ ok: true, skipped: "payment_not_paid" });
      }

      wlog("mark_stripe_payment_paid_start", {
        order_id: orderId,
        checkout_session_id: checkoutSessionId,
        amount_major: amountMajor,
        currency: currencyUpper,
      });

      const supabaseService = getSupabaseService();
      const { data: rpcData, error: rpcError } = await supabaseService.rpc(
        "mark_stripe_payment_paid",
        {
          p_order_id: orderId,
          p_checkout_session_id: checkoutSessionId,
          p_payment_intent_id: paymentIntentId,
          p_amount_total: amountMajor,
          p_currency: currencyUpper,
        }
      );

      if (rpcError) {
        logServerError("webhook mark_stripe_payment_paid", rpcError);
        wlog("mark_stripe_payment_paid_error", { message: rpcError.message, code: (rpcError as { code?: string }).code });
        return NextResponse.json(
          { error: toUserError(rpcError.message) },
          { status: 400 }
        );
      }

      const rpcResult = rpcData as MarkStripePaidRpcResult | null;
      const updated = Boolean(rpcResult?.updated);
      const email = rpcResult?.email;

      wlog("mark_stripe_payment_paid_result", {
        order_id: orderId,
        updated,
        payment_status_changed_to_paid: updated,
        has_email_payload: Boolean(email?.customerEmail),
      });

      if (updated && email?.customerEmail) {
        wlog("confirmation_email_sending", {
          order_id: orderId,
          order_number: email.orderNumber,
          customer_email: email.customerEmail,
        });

        await notifyPaymentConfirmed({
          customerName: String(email.customerName || "Customer"),
          customerEmail: String(email.customerEmail),
          orderNumber: String(email.orderNumber),
          orderId: String(email.orderId),
          status: String(email.status || "processing"),
          paymentStatus: "paid",
          total: Number(email.total || 0),
          currency: String(email.currency || "MYR"),
          createdAt: email.createdAt || null,
          items: Array.isArray(email.items)
            ? email.items.map((item) => ({
                title: String(item.title || ""),
                price: Number(item.price || 0),
                quantity: Number(item.quantity || 1),
              }))
            : [],
        });

        wlog("confirmation_email_sent", { order_id: orderId, order_number: email.orderNumber });
      } else if (!updated) {
        wlog("confirmation_email_skipped — order already paid (idempotent)", { order_id: orderId });
      } else {
        wlog("confirmation_email_skipped — no customer email in rpc result", { order_id: orderId });
      }

      wlog("webhook_response_200_ok", { event_id: event.id, order_id: orderId });
      return NextResponse.json({ ok: true });
    }

    // ── Failed / expired ──────────────────────────────────────────────────────
    if (
      event.type === "checkout.session.async_payment_failed" ||
      event.type === "checkout.session.expired"
    ) {
      wlog("mark_stripe_payment_failed_start", {
        event_type: event.type,
        order_id: orderId,
        checkout_session_id: checkoutSessionId,
        amount_major: amountMajor,
        currency: currencyUpper,
      });

      const supabaseService = getSupabaseService();
      const { data: failData, error: rpcError } = await supabaseService.rpc(
        "mark_stripe_payment_failed",
        {
          p_order_id: orderId,
          p_checkout_session_id: checkoutSessionId,
          p_amount_total: amountMajor,
          p_currency: currencyUpper,
        }
      );

      if (rpcError) {
        logServerError("webhook mark_stripe_payment_failed", rpcError);
        // Already paid or mismatch — do not retry, just log and return 200.
        wlog("mark_stripe_payment_failed_error — returning 200 anyway", {
          message: rpcError.message,
          order_id: orderId,
        });
        return NextResponse.json({ ok: true });
      }

      const failResult = failData as { updated: boolean } | null;
      wlog("mark_stripe_payment_failed_result", {
        order_id: orderId,
        updated: Boolean(failResult?.updated),
      });

      wlog("webhook_response_200_ok", { event_id: event.id, order_id: orderId });
      return NextResponse.json({ ok: true });
    }

    // ── Intentionally ignored events — always 200 ─────────────────────────────
    wlog("event_ignored — not handled by this webhook", { event_type: event.type, event_id: event.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logServerError("webhook unhandled", error);
    // Signature verification failures must be 400 so Stripe retries correctly.
    const msg = error instanceof Error ? error.message : String(error);
    wlog("ERROR: signature_or_parse_failure", { message: msg });
    return NextResponse.json(
      { error: toUserError(error) },
      { status: 400 }
    );
  }
}

