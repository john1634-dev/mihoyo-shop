import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/config";
import { normalizeCurrencyCode } from "@/lib/catalog-meta";
import {
  RECEIPT_TOKEN_TTL_MS,
  createReceiptToken,
  hashReceiptToken,
  signOrderAccessToken,
} from "@/lib/order-receipt";
import { generateOrderNumber } from "@/lib/orders";
import { checkRateLimit, clientIpFromRequest } from "@/lib/rate-limit";
import { getStripe, toStripeUnitAmount } from "@/lib/stripe";
import { getRequestUser } from "@/lib/supabase";
import { getSupabaseService } from "@/lib/supabase-service";
import { isValidEmail, sanitizeText } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  product_id?: string;
  email?: string;
  full_name?: string;
};

const CHECKOUT_SELECT =
  "id,title,slug,price,currency,status,cover_image_url";

export async function POST(request: Request) {
  try {
    const ip = clientIpFromRequest(request);
    const limited = checkRateLimit({
      key: `checkout:${ip}`,
      limit: 8,
      windowMs: 60_000,
    });
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many checkout attempts. Please wait and try again." },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSec) },
        }
      );
    }

    const body = (await request.json().catch(() => null)) as Body | null;
    const productId = body?.product_id?.trim();
    if (!productId) {
      return NextResponse.json({ error: "product_id is required" }, { status: 400 });
    }

    const productLimited = checkRateLimit({
      key: `checkout:product:${ip}:${productId}`,
      limit: 4,
      windowMs: 60_000,
    });
    if (!productLimited.ok) {
      return NextResponse.json(
        { error: "Too many attempts for this listing. Please wait." },
        {
          status: 429,
          headers: { "Retry-After": String(productLimited.retryAfterSec) },
        }
      );
    }

    const { user } = await getRequestUser(request);
    const service = getSupabaseService();

    const { data: product, error: productError } = await service
      .from("products")
      .select(CHECKOUT_SELECT)
      .eq("id", productId)
      .maybeSingle();

    if (productError || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    if (product.status !== "available") {
      return NextResponse.json(
        { error: "This listing is not available for purchase." },
        { status: 409 }
      );
    }

    const price = Number(product.price);
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: "Invalid product price" }, { status: 400 });
    }

    const currency = normalizeCurrencyCode(product.currency, "MYR");
    if (currency !== "MYR" && currency !== "USD") {
      return NextResponse.json(
        { error: "Unsupported listing currency for card checkout." },
        { status: 400 }
      );
    }

    let email = "";
    let fullName: string | null = null;

    if (user?.email) {
      email = user.email.toLowerCase().trim();
      fullName =
        sanitizeText(
          String(user.user_metadata?.full_name || body?.full_name || ""),
          120
        ) || null;
    } else {
      email = String(body?.email || "")
        .toLowerCase()
        .trim();
      if (!isValidEmail(email)) {
        return NextResponse.json(
          { error: "A valid email is required for guest checkout." },
          { status: 400 }
        );
      }
      fullName = sanitizeText(String(body?.full_name || ""), 120) || null;
    }

    const orderNumber = generateOrderNumber();
    const receiptToken = createReceiptToken();
    const receiptHash = hashReceiptToken(receiptToken);

    const orderInsert: Record<string, unknown> = {
      order_number: orderNumber,
      customer_id: user?.id ?? null,
      customer_email: email,
      customer_name: fullName || email.split("@")[0] || "Customer",
      customer_whatsapp: null,
      subtotal: price,
      total: price,
      total_amount: price,
      currency,
      status: "pending",
      order_status: "pending",
      payment_status: "pending",
      payment_method: "stripe",
      channel: "stripe",
      receipt_token_hash: receiptHash,
    };

    let { data: order, error: orderError } = await service
      .from("orders")
      .insert(orderInsert)
      .select("id,order_number,currency,total_amount,customer_email")
      .single();

    // If Phase 5.3 columns are not migrated yet, retry without new fields.
    if (
      orderError &&
      /channel|receipt_token_hash|column/i.test(orderError.message)
    ) {
      delete orderInsert.channel;
      delete orderInsert.receipt_token_hash;
      const retry = await service
        .from("orders")
        .insert(orderInsert)
        .select("id,order_number,currency,total_amount,customer_email")
        .single();
      order = retry.data;
      orderError = retry.error;
    }

    if (orderError || !order) {
      console.error("[checkout] order insert failed:", orderError?.message);
      return NextResponse.json(
        { error: "Could not create order." },
        { status: 500 }
      );
    }

    const itemInsert: Record<string, unknown> = {
      order_id: order.id,
      product_id: product.id,
      product_title: product.title,
      title_snapshot: product.title,
      price: price,
      unit_price: price,
      price_snapshot: price,
      currency_snapshot: currency,
      quantity: 1,
      subtotal: price,
    };

    let { error: itemError } = await service.from("order_items").insert(itemInsert);
    if (itemError && /snapshot|column/i.test(itemError.message)) {
      delete itemInsert.title_snapshot;
      delete itemInsert.price_snapshot;
      delete itemInsert.currency_snapshot;
      const retryItem = await service.from("order_items").insert(itemInsert);
      itemError = retryItem.error;
    }

    if (itemError) {
      console.error("[checkout] order_items insert failed:", itemError.message);
      await service.from("orders").delete().eq("id", order.id);
      return NextResponse.json(
        { error: "Could not create order items." },
        { status: 500 }
      );
    }

    const accessToken = signOrderAccessToken({
      orderId: order.id,
      email,
      expiresAt: Date.now() + RECEIPT_TOKEN_TTL_MS,
    });

    const base = SITE_URL.replace(/\/$/, "");
    const successUrl =
      `${base}/checkout/success` +
      `?order_id=${encodeURIComponent(order.id)}` +
      `&session_id={CHECKOUT_SESSION_ID}` +
      `&t=${encodeURIComponent(accessToken)}`;
    const cancelUrl = `${base}/product/${encodeURIComponent(product.slug)}?checkout=cancelled`;

    const stripe = getStripe();
    const unitAmount = toStripeUnitAmount(price, currency);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      client_reference_id: order.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: unitAmount,
            product_data: {
              name: product.title,
              description: `Game account listing on Baitu Games (${orderNumber}). Payment confirms an order for sourcing — not instant delivery.`,
              ...(product.cover_image_url
                ? { images: [product.cover_image_url] }
                : {}),
            },
          },
        },
      ],
      metadata: {
        order_id: order.id,
        product_id: product.id,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      await service
        .from("orders")
        .update({
          status: "failed",
          order_status: "failed",
          payment_status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 502 }
      );
    }

    const { error: attachError } = await service.rpc(
      "attach_stripe_checkout_session",
      {
        p_order_id: order.id,
        p_checkout_session_id: session.id,
        p_payment_intent_id:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : null,
      }
    );

    if (attachError) {
      // Fallback direct update if RPC unavailable
      await service
        .from("orders")
        .update({
          stripe_checkout_session_id: session.id,
          payment_method: "stripe",
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
    }

    // Product remains available — sourced after payment. Do NOT mark sold here.

    return NextResponse.json({
      url: session.url,
      order_id: order.id,
      order_number: order.order_number,
    });
  } catch (error) {
    console.error("[checkout] unexpected:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Checkout failed. Please try again." },
      { status: 500 }
    );
  }
}
