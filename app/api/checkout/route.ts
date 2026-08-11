import { NextResponse } from "next/server";
import { getRequestUser, supabase } from "@/lib/supabase";
import { toUserError } from "@/lib/errors";
import { isValidEmail, isValidPhone, sanitizeText } from "@/lib/validation";
import type { PlaceOrderResult } from "@/lib/orders";
import { notifyOrderCreated } from "@/lib/email";

type CheckoutBody = {
  customerName?: string;
  customerEmail?: string;
  customerWhatsapp?: string;
  customerNote?: string;
  paymentMethod?: string;
  productIds?: string[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckoutBody;
    const { user, client } = await getRequestUser(request);

    const customerName = sanitizeText(body.customerName || "", 120);
    const customerWhatsapp = sanitizeText(body.customerWhatsapp || "", 30);
    const customerNote = sanitizeText(body.customerNote || "", 1000);
    const paymentMethod = sanitizeText(body.paymentMethod || "website", 40);
    const productIds = Array.isArray(body.productIds)
      ? body.productIds.filter((id) => typeof id === "string" && id.length > 0)
      : [];

    // Logged-in users use account email; guests must provide email
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

    if (productIds.length === 0) {
      return NextResponse.json(
        { error: "Your cart is empty." },
        { status: 400 }
      );
    }

    const uniqueIds = Array.from(new Set(productIds));
    if (uniqueIds.length !== productIds.length) {
      return NextResponse.json(
        { error: "Each game account can only be purchased once." },
        { status: 400 }
      );
    }

    const rpcClient = user ? client : supabase;

    const { data, error } = await rpcClient.rpc("place_store_order", {
      p_customer_name: customerName,
      p_customer_email: customerEmail,
      p_customer_whatsapp: customerWhatsapp,
      p_customer_note: customerNote,
      p_payment_method: paymentMethod || "website",
      p_product_ids: uniqueIds,
    });

    if (error) {
      return NextResponse.json(
        { error: toUserError(error.message) },
        { status: 400 }
      );
    }

    const result = data as PlaceOrderResult;

    const emailResult = await notifyOrderCreated({
      customerName,
      customerEmail: result.customer_email || customerEmail,
      orderNumber: result.order_number,
      orderId: result.order_id,
      status: "pending",
      paymentStatus: "pending",
      total: Number(result.total || 0),
      currency: result.currency || "MYR",
      items: (result.items || []).map((item) => ({
        title: item.title,
        price: Number(item.price),
        quantity: 1,
      })),
    });

    return NextResponse.json({
      orderId: result.order_id,
      orderNumber: result.order_number,
      total: result.total,
      currency: result.currency || "MYR",
      items: result.items || [],
      email: {
        sent: emailResult.ok,
        reason: emailResult.ok ? undefined : emailResult.reason,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: toUserError(error) },
      { status: 500 }
    );
  }
}
