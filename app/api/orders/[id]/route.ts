import { NextResponse } from "next/server";
import {
  customerFacingStatusLabel,
  itemPrice,
  itemTitle,
  normalizeOrderStatus,
  orderAmount,
  orderCurrency,
  type OrderItemRow,
  type OrderRow,
} from "@/lib/orders";
import { verifyOrderAccessToken } from "@/lib/order-receipt";
import { getRequestUser } from "@/lib/supabase";
import { getSupabaseService } from "@/lib/supabase-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function publicOrderPayload(order: OrderRow, items: OrderItemRow[]) {
  const status = normalizeOrderStatus(order);
  return {
    order_id: order.id,
    order_number: order.order_number,
    status,
    status_label: customerFacingStatusLabel(status),
    payment_status: order.payment_status,
    currency: orderCurrency(order),
    amount: orderAmount(order),
    created_at: order.created_at,
    paid_at: order.paid_at ?? null,
    fulfilled_at: order.fulfilled_at ?? null,
    channel: order.channel ?? order.payment_method ?? null,
    items: items.map((item) => ({
      title: itemTitle(item),
      price: itemPrice(item),
      currency: item.currency_snapshot || orderCurrency(order),
      quantity: item.quantity ?? 1,
    })),
  };
}

export async function GET(request: Request, { params }: Params) {
  const { id: orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  const sessionId = url.searchParams.get("session_id");

  const { user } = await getRequestUser(request);
  const service = getSupabaseService();

  const { data: order, error } = await service
    .from("orders")
    .select(
      "id,order_number,customer_id,customer_email,status,order_status,payment_status,payment_method,channel,currency,subtotal,total,total_amount,stripe_checkout_session_id,created_at,paid_at,fulfilled_at"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let authorized = false;

  if (user?.id && order.customer_id && user.id === order.customer_id) {
    authorized = true;
  }

  const tokenCheck = verifyOrderAccessToken(token, orderId);
  if (tokenCheck.ok) {
    if (
      order.customer_email &&
      tokenCheck.email.toLowerCase() === order.customer_email.toLowerCase()
    ) {
      authorized = true;
    }
  }

  // Optional Stripe session binding for success page (not payment proof)
  if (
    !authorized &&
    sessionId &&
    order.stripe_checkout_session_id &&
    sessionId === order.stripe_checkout_session_id &&
    tokenCheck.ok
  ) {
    authorized = true;
  }

  if (!authorized) {
    // Avoid order ID enumeration: same response as missing
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: items } = await service
    .from("order_items")
    .select(
      "id,order_id,product_id,product_title,title_snapshot,price,unit_price,price_snapshot,currency_snapshot,quantity,subtotal,created_at"
    )
    .eq("order_id", orderId);

  return NextResponse.json(
    publicOrderPayload(order as OrderRow, (items || []) as OrderItemRow[])
  );
}
