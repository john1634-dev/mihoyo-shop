import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getRequestUser, supabase } from "@/lib/supabase";
import { getSupabaseService } from "@/lib/supabase-service";
import { isValidPhone, isValidEmail, sanitizeText } from "@/lib/validation";
import { logServerError, toUserError } from "@/lib/errors";
import type { PlaceOrderResult } from "@/lib/orders";
import { SITE_URL } from "@/lib/config";

type Body = {
  customerName: string;
  customerEmail?: string;
  customerWhatsapp: string;
  customerNote?: string;
  productIds: string[];
  couponCode?: string;
};

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

function logStripeDebug(message: string, extra?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") {
    console.info("[Stripe Checkout Debug]", message, extra || {});
  }
}

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function safeSupabaseError(error: unknown) {
  const e = error as SupabaseErrorLike;
  return {
    code: e?.code,
    message: e?.message,
    details: e?.details,
    hint: e?.hint,
  };
}

function getStripe(): Stripe {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  return new Stripe(STRIPE_SECRET_KEY);
}

function distributeDiscountCents(
  items: Array<{ title: string; price: number; quantity?: number }>,
  discountCents: number
) {
  const rows = items.map((item, idx) => ({
    idx,
    title: item.title,
    quantity: item.quantity || 1,
    unitCents: Math.max(1, Math.round(Number(item.price) * 100)),
  }));

  const totalCents = rows.reduce((sum, r) => sum + r.unitCents * r.quantity, 0);
  if (discountCents <= 0) return rows;
  if (discountCents >= totalCents) {
    throw new Error("INVALID_DISCOUNT_AMOUNT");
  }

  // Reduce discount from highest-price rows first while keeping each unit >= 1 cent.
  const sorted = [...rows].sort((a, b) => b.unitCents - a.unitCents);
  let remaining = discountCents;
  for (const row of sorted) {
    if (remaining <= 0) break;
    const maxRowDiscount = row.unitCents - 1;
    const applied = Math.min(maxRowDiscount, remaining);
    row.unitCents -= applied;
    remaining -= applied;
  }
  if (remaining > 0) {
    // Should be unreachable in normal subtotal/discount constraints.
    throw new Error("INVALID_DISCOUNT_AMOUNT");
  }

  return rows.sort((a, b) => a.idx - b.idx);
}

export async function POST(request: Request) {
  let createdOrderId: string | null = null;
  try {
    const body = (await request.json()) as Body;

    const { user, client } = await getRequestUser(request);
    const rpcClient = user ? client : supabase;

    const customerName = sanitizeText(body.customerName || "", 120);
    const customerWhatsapp = sanitizeText(body.customerWhatsapp || "", 30);
    const customerNote = sanitizeText(body.customerNote || "", 1000);

    // Logged-in users must use their account email; guests must provide email.
    const customerEmail = user?.email
      ? user.email
      : sanitizeText(body.customerEmail || "", 200);

    if (customerName.length < 2) {
      return NextResponse.json(
        { error: "Please enter your full name." },
        { status: 400 }
      );
    }

    if (!user && !isValidEmail(customerEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (!isValidPhone(customerWhatsapp)) {
      return NextResponse.json(
        { error: "Please enter a valid WhatsApp number." },
        { status: 400 }
      );
    }

    const uniqueIds = Array.from(new Set(body.productIds || [])).filter(
      (id) => typeof id === "string" && id.length > 0
    );

    if (uniqueIds.length === 0) {
      return NextResponse.json(
        { error: "Your cart is empty." },
        { status: 400 }
      );
    }

    // 1) Create pending order with existing atomic inventory protection.
    logStripeDebug("place_store_order start", {
      uniqueIds_count: uniqueIds.length,
      payment_method: "stripe",
    });
    const { data: placeResult, error: placeError } = await rpcClient.rpc(
      "place_store_order",
      {
        p_customer_name: customerName,
        p_customer_email: customerEmail,
        p_customer_whatsapp: customerWhatsapp,
        p_customer_note: customerNote,
        p_payment_method: "stripe",
        p_product_ids: uniqueIds,
      }
    );

    if (placeError) {
      logServerError("stripe checkout place_store_order", placeError);
      logStripeDebug("place_store_order error", safeSupabaseError(placeError));
      return NextResponse.json(
        { error: toUserError(placeError.message) },
        { status: 400 }
      );
    }

    const order = placeResult as PlaceOrderResult;
    createdOrderId = order.order_id;

    // 1b) Atomically apply coupon if provided (server-side only).
    type CouponApplyResult = {
      applied: boolean;
      coupon_id?: string;
      code?: string;
      discount_amount?: number;
      reason?: string;
    };
    let appliedCoupon: CouponApplyResult | null = null;
    const couponCode = typeof body.couponCode === "string" ? body.couponCode.trim() : "";
    if (couponCode) {
      const svcClient = getSupabaseService();
      const { data: couponData, error: couponError } = await svcClient.rpc("apply_coupon_to_order", {
        p_order_id: order.order_id,
        p_coupon_code: couponCode,
        p_user_id: user?.id ?? null,
        p_guest_email: user?.id ? null : customerEmail,
      });

      if (couponError) {
        logServerError("stripe checkout apply_coupon", couponError);
        if (createdOrderId) {
          await getSupabaseService().rpc("rollback_checkout_order_on_session_failure", {
            p_order_id: createdOrderId,
            p_reason: "coupon_apply_error",
          });
        }
        return NextResponse.json({ error: toUserError(couponError.message) }, { status: 400 });
      }

      appliedCoupon = (couponData as CouponApplyResult) || null;
      if (!appliedCoupon?.applied) {
        if (createdOrderId) {
          await getSupabaseService().rpc("rollback_checkout_order_on_session_failure", {
            p_order_id: createdOrderId,
            p_reason: "coupon_invalid",
          });
        }
        return NextResponse.json(
          { error: appliedCoupon?.reason || "Coupon is not valid for this order." },
          { status: 400 }
        );
      }
    }

    logStripeDebug("place_store_order ok", {
      order_id: order.order_id,
      order_total_major: order.total,
      currency: order.currency,
      items_count: order.items?.length || 0,
    });

    // 1c) Read final order total after coupon adjustment.
    const svc = getSupabaseService();
    const { data: finalOrder } = await svc
      .from("orders")
      .select("total_amount, discount_amount")
      .eq("id", order.order_id)
      .maybeSingle();
    const finalTotal = Number(finalOrder?.total_amount ?? order.total ?? 0);
    const finalDiscount = Number(finalOrder?.discount_amount ?? appliedCoupon?.discount_amount ?? 0);

    // 2) Create Stripe Checkout Session.
    // Omit payment_method_types so Stripe Checkout uses dynamic payment methods
    // from the Dashboard (cards, wallets, GrabPay, Link, etc. when eligible).
    // Do NOT hard-code fpx — it is not available on this Stripe account.
    // Note: automatic_payment_methods applies to PaymentIntents, not Checkout Sessions.
    const stripe = getStripe();
    const discountedRows = distributeDiscountCents(order.items || [], Math.round(finalDiscount * 100));
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = discountedRows.map((row) => ({
      price_data: {
        currency: "myr",
        product_data: { name: row.title },
        unit_amount: row.unitCents,
      },
      quantity: row.quantity,
    }));

    // Success page reads payment_status from the server; email unlocks guest receipts.
    const successParams = new URLSearchParams({
      id: order.order_id,
    });
    if (!user?.id && customerEmail) {
      successParams.set("email", customerEmail);
    }
    const successUrl = `${SITE_URL}/orders/success?${successParams.toString()}`;
    const cancelUrl = `${SITE_URL}/checkout`;

    logStripeDebug("stripe checkout session create start", {
      payment_methods: "dashboard_dynamic",
      currency: "myr",
      order_id: order.order_id,
      order_total_major: finalTotal,
    });

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      line_items: lineItems,
      // Keep MYR pricing; dynamic methods respect currency + Dashboard settings.
      currency: "myr",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        order_id: order.order_id,
        customer_id: user?.id || "",
        guest_order_id: user?.id ? "" : order.order_id,
      },
      // Helps Link / saved payment UX when email is known.
      ...(customerEmail && isValidEmail(customerEmail)
        ? { customer_email: customerEmail }
        : {}),
    };

    let checkoutSession: Stripe.Checkout.Session;
    try {
      checkoutSession = await stripe.checkout.sessions.create(sessionParams);
    } catch (stripeError) {
      const e = stripeError as {
        type?: string;
        code?: string;
        message?: string;
        param?: string;
      };
      logStripeDebug("stripe error", {
        error: {
          type: e?.type,
          code: e?.code,
          message: e?.message,
          param: e?.param,
        },
      });

      if (createdOrderId) {
        await getSupabaseService().rpc("rollback_checkout_order_on_session_failure", {
          p_order_id: createdOrderId,
          p_reason: "stripe_session_create_failed",
        });
      }
      throw stripeError;
    }

    const paymentIntentId =
      typeof checkoutSession.payment_intent === "string"
        ? checkoutSession.payment_intent
        : checkoutSession.payment_intent?.id || "";

    // 3) Persist Stripe session ids in the order for webhook lookup.
    const supabaseService = getSupabaseService();
    logStripeDebug("attach_stripe_checkout_session start", {
      order_id: order.order_id,
      stripe_checkout_session_id: checkoutSession.id,
      stripe_payment_intent_id: paymentIntentId,
    });
    const { error: attachError } = await supabaseService.rpc(
      "attach_stripe_checkout_session",
      {
        p_order_id: order.order_id,
        p_checkout_session_id: checkoutSession.id,
        p_payment_intent_id: paymentIntentId,
      }
    );

    if (attachError) {
      logServerError("stripe checkout attach_session", attachError);
      logStripeDebug(
        "attach_stripe_checkout_session error",
        safeSupabaseError(attachError)
      );
      if (createdOrderId) {
        await getSupabaseService().rpc("rollback_checkout_order_on_session_failure", {
          p_order_id: createdOrderId,
          p_reason: "attach_checkout_session_failed",
        });
      }
      return NextResponse.json(
        { error: toUserError(attachError.message) },
        { status: 400 }
      );
    }

    if (!checkoutSession.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      checkoutUrl: checkoutSession.url,
      orderId: order.order_id,
      orderNumber: order.order_number,
    });
  } catch (error) {
    const unhandledMessage =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message?: unknown }).message !== "undefined"
        ? String((error as { message?: unknown }).message)
        : String(error);

    logServerError("stripe checkout unhandled", error);
    logStripeDebug("unhandled error", { error: toUserError(error) });

    if (createdOrderId) {
      await getSupabaseService().rpc("rollback_checkout_order_on_session_failure", {
        p_order_id: createdOrderId,
        p_reason: "unhandled_checkout_error",
      });
    }

    return NextResponse.json(
      { error: toUserError(unhandledMessage) },
      { status: 500 }
    );
  }
}

