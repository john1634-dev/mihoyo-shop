import { NextResponse } from "next/server";
import {
  itemTitle,
  normalizeOrderStatus,
  orderAmount,
  orderCurrency,
  type OrderItemRow,
  type OrderRow,
} from "@/lib/orders";
import { getRequestUser } from "@/lib/supabase";
import { getSupabaseService } from "@/lib/supabase-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user } = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = getSupabaseService();
  const { data: orders, error } = await service
    .from("orders")
    .select(
      "id,order_number,customer_id,status,order_status,payment_status,currency,total_amount,total,subtotal,created_at"
    )
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (orders || []).map((o) => o.id);
  const { data: items } = ids.length
    ? await service
        .from("order_items")
        .select(
          "id,order_id,product_title,title_snapshot,price,unit_price,price_snapshot,quantity,created_at,product_id,subtotal,currency_snapshot"
        )
        .in("order_id", ids)
    : { data: [] as OrderItemRow[] };

  const byOrder = new Map<string, OrderItemRow[]>();
  for (const item of (items || []) as OrderItemRow[]) {
    const list = byOrder.get(item.order_id) || [];
    list.push(item);
    byOrder.set(item.order_id, list);
  }

  return NextResponse.json({
    orders: ((orders || []) as OrderRow[]).map((order) => ({
      id: order.id,
      order_number: order.order_number,
      status: normalizeOrderStatus(order),
      payment_status: order.payment_status,
      currency: orderCurrency(order),
      amount: orderAmount(order),
      created_at: order.created_at,
      items: (byOrder.get(order.id) || []).map((item) => ({
        title: itemTitle(item),
      })),
    })),
  });
}
