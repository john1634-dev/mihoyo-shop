import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase";
import { toUserError } from "@/lib/errors";
import {
  notifyOrderCompleted,
  notifyPaymentConfirmed,
} from "@/lib/email";

type Body = {
  orderId?: string;
  previousPaymentStatus?: string | null;
  previousOrderStatus?: string | null;
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: routeId } = await context.params;
    const body = (await request.json()) as Body;
    const orderId = body.orderId || routeId;

    const { user, client } = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: profile } = await client
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    const { data: order, error: orderError } = await client
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const { data: items } = await client
      .from("order_items")
      .select("product_title, price, unit_price, quantity, subtotal")
      .eq("order_id", orderId);

    const payload = {
      customerName: order.customer_name || "Customer",
      customerEmail: order.customer_email || "",
      orderNumber: order.order_number || order.id.slice(0, 8),
      orderId: order.id,
      status: order.order_status || order.status || "pending",
      paymentStatus: order.payment_status || "pending",
      total: Number(order.total_amount ?? order.total ?? 0),
      currency: order.currency || "MYR",
      createdAt: order.created_at,
      items: (items || []).map((item) => ({
        title: item.product_title,
        price: Number(item.unit_price || item.price || 0),
        quantity: Number(item.quantity || 1),
      })),
    };

    if (!payload.customerEmail) {
      return NextResponse.json({
        sent: false,
        reason: "Order has no customer email.",
      });
    }

    const results: Array<{ event: string; ok: boolean; reason?: string }> = [];

    const prevPayment = body.previousPaymentStatus || "";
    const prevStatus = body.previousOrderStatus || "";

    if (
      payload.paymentStatus === "paid" &&
      prevPayment !== "paid"
    ) {
      const result = await notifyPaymentConfirmed(payload);
      results.push({
        event: "payment_confirmed",
        ok: result.ok,
        reason: result.reason,
      });
    }

    if (
      payload.status === "completed" &&
      prevStatus !== "completed"
    ) {
      const result = await notifyOrderCompleted(payload);
      results.push({
        event: "order_completed",
        ok: result.ok,
        reason: result.reason,
      });
    }

    if (results.length === 0) {
      return NextResponse.json({
        sent: false,
        reason: "No email event for this status change.",
      });
    }

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: toUserError(error) }, { status: 500 });
  }
}
