import { NextResponse } from "next/server";
import {
  itemPrice,
  itemTitle,
  normalizeOrderStatus,
  orderAmount,
  orderCurrency,
  type OrderItemRow,
  type OrderRow,
} from "@/lib/orders";
import { isValidUuid } from "@/lib/inventory";
import { emailDeliveryIdempotencyKey } from "@/lib/inventory-delivery";
import { isNextResponse, requireAdmin } from "@/lib/require-admin";
import { getSupabaseService } from "@/lib/supabase-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/admin/orders/[id]
 * Safe order detail for admin — never credentials.
 */
export async function GET(_request: Request, context: RouteContext) {
  const admin = await requireAdmin(_request);
  if (isNextResponse(admin)) return admin;

  const { id } = await context.params;
  const orderId = id?.trim() || "";

  if (!isValidUuid(orderId)) {
    return NextResponse.json({ error: "Invalid order id." }, { status: 400 });
  }

  const service = getSupabaseService();

  const { data: order, error: orderError } = await service
    .from("orders")
    .select(
      "id,order_number,customer_email,customer_name,customer_id,status,order_status,payment_status,payment_method,channel,currency,total_amount,total,subtotal,created_at,paid_at,sourcing_started_at,fulfilled_at,cancelled_at,refunded_at,delivery_note,delivery_method,admin_note"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const { data: items } = await service
    .from("order_items")
    .select(
      "id,order_id,product_id,product_title,title_snapshot,price,unit_price,price_snapshot,currency_snapshot,quantity,subtotal,created_at"
    )
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  let inventory: {
    exists: boolean;
    id: string | null;
    status: string | null;
    assigned_at: string | null;
    delivered_at: string | null;
  } = {
    exists: false,
    id: null,
    status: null,
    assigned_at: null,
    delivered_at: null,
  };

  const { data: inventoryRow, error: inventoryError } = await service
    .from("inventory_items")
    .select("id,status,assigned_at,delivered_at")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();

  if (
    !inventoryError ||
    /relation|schema cache|does not exist|PGRST/i.test(inventoryError.message)
  ) {
    if (inventoryRow) {
      inventory = {
        exists: true,
        id: inventoryRow.id,
        status: inventoryRow.status,
        assigned_at: inventoryRow.assigned_at ?? null,
        delivered_at: inventoryRow.delivered_at ?? null,
      };
    }
  }

  let emailDelivery: {
    status: string | null;
    provider_message_id: string | null;
    error_code: string | null;
    created_at: string | null;
    updated_at: string | null;
  } = {
    status: null,
    provider_message_id: null,
    error_code: null,
    created_at: null,
    updated_at: null,
  };

  const idempotencyKey = emailDeliveryIdempotencyKey(orderId);
  const { data: deliveryRow, error: deliveryError } = await service
    .from("delivery_attempts")
    .select("status,provider_message_id,error_code,created_at,updated_at,channel")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (
    !deliveryError ||
    /relation|schema cache|does not exist|PGRST/i.test(deliveryError.message)
  ) {
    if (deliveryRow) {
      emailDelivery = {
        status: deliveryRow.status,
        provider_message_id: deliveryRow.provider_message_id ?? null,
        error_code: deliveryRow.error_code ?? null,
        created_at: deliveryRow.created_at ?? null,
        updated_at: deliveryRow.updated_at ?? null,
      };
    }
  }

  const row = order as OrderRow;

  return NextResponse.json({
    ok: true,
    order: {
      id: row.id,
      order_number: row.order_number,
      status: normalizeOrderStatus(row),
      order_status: row.order_status,
      payment_status: row.payment_status,
      customer_email: row.customer_email,
      customer_name: row.customer_name,
      currency: orderCurrency(row),
      amount: orderAmount(row),
      channel: row.channel || row.payment_method,
      created_at: row.created_at,
      paid_at: row.paid_at ?? null,
      sourcing_started_at: row.sourcing_started_at ?? null,
      fulfilled_at: row.fulfilled_at ?? null,
      delivery_note: row.delivery_note ?? null,
      delivery_method: row.delivery_method ?? null,
      admin_note: row.admin_note ?? null,
    },
    items: ((items || []) as OrderItemRow[]).map((item) => ({
      id: item.id,
      title: itemTitle(item),
      price: itemPrice(item),
      product_id: item.product_id,
      quantity: item.quantity,
    })),
    inventory,
    email_delivery: emailDelivery,
  });
}
