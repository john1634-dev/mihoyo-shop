import { NextResponse } from "next/server";
import {
  ORDER_STATUSES,
  itemPrice,
  itemTitle,
  normalizeOrderStatus,
  orderAmount,
  orderCurrency,
  type OrderItemRow,
  type OrderRow,
  type OrderStatus,
} from "@/lib/orders";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";
import { getSupabaseService } from "@/lib/supabase-service";
import { sanitizeText } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["cancelled", "failed"],
  paid: ["sourcing", "cancelled", "refunded"],
  sourcing: ["fulfilled", "cancelled", "refunded"],
  fulfilled: ["refunded"],
  cancelled: [],
  refunded: [],
  failed: ["cancelled"],
};

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  const service = getSupabaseService();
  const url = new URL(request.url);
  const status = url.searchParams.get("status")?.trim() || "";

  let query = service
    .from("orders")
    .select(
      "id,order_number,customer_email,customer_name,customer_id,status,order_status,payment_status,payment_method,channel,currency,total_amount,total,subtotal,created_at,paid_at,sourcing_started_at,fulfilled_at,cancelled_at,refunded_at,delivery_note,delivery_method,admin_note,stripe_checkout_session_id"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) {
    query = query.or(`status.eq.${status},order_status.eq.${status}`);
  }

  const { data: orders, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (orders || []).map((o) => o.id);
  const { data: items } = ids.length
    ? await service
        .from("order_items")
        .select(
          "id,order_id,product_id,product_title,title_snapshot,price,unit_price,price_snapshot,currency_snapshot,quantity,subtotal,created_at"
        )
        .in("order_id", ids)
    : { data: [] as OrderItemRow[] };

  const itemsByOrder = new Map<string, OrderItemRow[]>();
  for (const item of (items || []) as OrderItemRow[]) {
    const list = itemsByOrder.get(item.order_id) || [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }

  // Safe inventory + email delivery metadata only (never credentials).
  const inventoryByOrder = new Map<
    string,
    { id: string; status: string }
  >();
  const emailDeliveryByOrder = new Map<
    string,
    { status: string; provider_message_id: string | null }
  >();

  if (ids.length) {
    const { data: inventoryRows, error: inventoryError } = await service
      .from("inventory_items")
      .select("id,order_id,status")
      .in("order_id", ids);

    if (
      inventoryError &&
      !/relation|schema cache|does not exist|PGRST/i.test(inventoryError.message)
    ) {
      // Non-fatal for orders list
    } else {
      for (const row of inventoryRows || []) {
        if (row.order_id) {
          inventoryByOrder.set(row.order_id, {
            id: row.id,
            status: row.status,
          });
        }
      }
    }

    const { data: deliveryRows, error: deliveryError } = await service
      .from("delivery_attempts")
      .select("order_id,status,provider_message_id,channel,updated_at")
      .in("order_id", ids)
      .eq("channel", "email")
      .order("updated_at", { ascending: false });

    if (
      !deliveryError ||
      /relation|schema cache|does not exist|PGRST/i.test(deliveryError.message)
    ) {
      for (const row of deliveryRows || []) {
        if (row.order_id && !emailDeliveryByOrder.has(row.order_id)) {
          emailDeliveryByOrder.set(row.order_id, {
            status: row.status,
            provider_message_id: row.provider_message_id ?? null,
          });
        }
      }
    }
  }

  return NextResponse.json({
    orders: ((orders || []) as OrderRow[]).map((order) => {
      const orderItems = itemsByOrder.get(order.id) || [];
      const inventory = inventoryByOrder.get(order.id) || null;
      const emailDelivery = emailDeliveryByOrder.get(order.id) || null;
      return {
        id: order.id,
        order_number: order.order_number,
        customer_email: order.customer_email,
        customer_name: order.customer_name,
        status: normalizeOrderStatus(order),
        payment_status: order.payment_status,
        currency: orderCurrency(order),
        amount: orderAmount(order),
        channel: order.channel || order.payment_method,
        created_at: order.created_at,
        paid_at: order.paid_at ?? null,
        sourcing_started_at: order.sourcing_started_at ?? null,
        fulfilled_at: order.fulfilled_at ?? null,
        delivery_note: order.delivery_note ?? null,
        delivery_method: order.delivery_method ?? null,
        admin_note: order.admin_note ?? null,
        inventory,
        email_delivery: emailDelivery,
        items: orderItems.map((item) => ({
          title: itemTitle(item),
          price: itemPrice(item),
          product_id: item.product_id,
        })),
      };
    }),
  });
}

type PatchBody = {
  order_id?: string;
  status?: string;
  delivery_note?: string;
  delivery_method?: string;
  admin_note?: string;
};

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (isNextResponse(admin)) return admin;

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  const orderId = body?.order_id?.trim();
  const nextStatus = body?.status?.trim().toLowerCase() as OrderStatus | undefined;

  if (!orderId || !nextStatus || !(ORDER_STATUSES as readonly string[]).includes(nextStatus)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const service = getSupabaseService();
  const { data: order, error } = await service
    .from("orders")
    .select(
      "id,status,order_status,payment_status,paid_at,sourcing_started_at,fulfilled_at,cancelled_at,refunded_at"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const current = normalizeOrderStatus(order as OrderRow);
  const allowed = ADMIN_TRANSITIONS[current] || [];
  if (!allowed.includes(nextStatus)) {
    return NextResponse.json(
      {
        error: `Cannot move order from ${current} to ${nextStatus}.`,
      },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    status: nextStatus,
    order_status: nextStatus,
    updated_at: now,
  };

  if (typeof body?.delivery_note === "string") {
    update.delivery_note = sanitizeText(body.delivery_note, 2000) || null;
  }
  if (typeof body?.delivery_method === "string") {
    update.delivery_method = sanitizeText(body.delivery_method, 120) || null;
  }
  if (typeof body?.admin_note === "string") {
    update.admin_note = sanitizeText(body.admin_note, 2000) || null;
  }

  if (nextStatus === "sourcing") {
    update.sourcing_started_at = order.sourcing_started_at || now;
  }
  if (nextStatus === "fulfilled") {
    update.fulfilled_at = order.fulfilled_at || now;
    if (!order.sourcing_started_at) {
      update.sourcing_started_at = now;
    }
  }
  if (nextStatus === "cancelled") {
    update.cancelled_at = order.cancelled_at || now;
  }
  if (nextStatus === "refunded") {
    update.refunded_at = order.refunded_at || now;
    update.payment_status = "refunded";
  }

  let { error: updateError } = await service
    .from("orders")
    .update(update)
    .eq("id", orderId);

  if (updateError && /column|sourcing_started|fulfilled_at|cancelled_at|refunded_at|delivery_/i.test(updateError.message)) {
    // Pre-migration fallback using legacy status names where needed
    const legacyStatus =
      nextStatus === "sourcing"
        ? "processing"
        : nextStatus === "fulfilled"
          ? "completed"
          : nextStatus;

    const fallback: Record<string, unknown> = {
      status: legacyStatus,
      order_status: legacyStatus,
      updated_at: now,
    };
    if (nextStatus === "refunded") {
      fallback.payment_status = "refunded";
    }
    const retry = await service.from("orders").update(fallback).eq("id", orderId);
    updateError = retry.error;
  }

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: nextStatus });
}
