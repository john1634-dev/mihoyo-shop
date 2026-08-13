import { normalizeCurrencyCode } from "@/lib/catalog-meta";

export const ORDER_STATUSES = [
  "pending",
  "paid",
  "sourcing",
  "fulfilled",
  "cancelled",
  "refunded",
  "failed",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderRow = {
  id: string;
  order_number: string | null;
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  status: string | null;
  order_status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  channel: string | null;
  currency: string | null;
  subtotal: number | null;
  total: number | null;
  total_amount: number | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
  updated_at?: string | null;
  paid_at?: string | null;
  sourcing_started_at?: string | null;
  fulfilled_at?: string | null;
  cancelled_at?: string | null;
  refunded_at?: string | null;
  delivery_note?: string | null;
  delivery_method?: string | null;
  admin_note?: string | null;
  country_code?: string | null;
  receipt_token_hash?: string | null;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_title: string | null;
  title_snapshot?: string | null;
  price: number | null;
  unit_price: number | null;
  price_snapshot?: number | null;
  currency_snapshot?: string | null;
  quantity: number | null;
  subtotal: number | null;
  created_at: string;
};

/** Normalize legacy processing/completed into Phase 5.3 vocabulary for UI. */
export function normalizeOrderStatus(order: {
  status?: string | null;
  order_status?: string | null;
  payment_status?: string | null;
}): OrderStatus {
  const raw = (order.status || order.order_status || "pending").toLowerCase();

  if (raw === "processing") return "sourcing";
  if (raw === "completed") return "fulfilled";

  if ((ORDER_STATUSES as readonly string[]).includes(raw)) {
    return raw as OrderStatus;
  }

  if (order.payment_status === "failed") return "failed";
  if (order.payment_status === "refunded") return "refunded";
  if (order.payment_status === "paid") return "paid";

  return "pending";
}

export function orderAmount(order: {
  total_amount?: number | null;
  total?: number | null;
  subtotal?: number | null;
}): number {
  const value = Number(order.total_amount ?? order.total ?? order.subtotal ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function orderCurrency(order: { currency?: string | null }): string {
  return normalizeCurrencyCode(order.currency, "MYR");
}

export function itemTitle(item: OrderItemRow): string {
  return (item.title_snapshot || item.product_title || "Account").trim();
}

export function itemPrice(item: OrderItemRow): number {
  const value = Number(
    item.price_snapshot ?? item.unit_price ?? item.price ?? 0
  );
  return Number.isFinite(value) ? value : 0;
}

export function customerFacingStatusLabel(status: OrderStatus): string {
  switch (status) {
    case "pending":
      return "Payment processing";
    case "paid":
      return "Payment confirmed";
    case "sourcing":
      return "Sourcing account";
    case "fulfilled":
      return "Order fulfilled";
    case "cancelled":
      return "Cancelled";
    case "refunded":
      return "Refunded";
    case "failed":
      return "Payment failed";
    default:
      return status;
  }
}

export function generateOrderNumber(): string {
  const stamp = new Date()
    .toLocaleString("en-GB", {
      timeZone: "Asia/Kuala_Lumpur",
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\//g, "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BG-${stamp}-${rand}`;
}
