import "server-only";

import { sendTransactionalEmail } from "@/lib/email";
import { orderAmount, orderCurrency } from "@/lib/orders";
import {
  getProductTypeLabel,
  isAccountProductType,
  normalizeProductType,
} from "@/lib/product-type";
import { getSupabaseService } from "@/lib/supabase-service";

type OrderNotificationContext = {
  orderId: string;
  orderNumber: string | null;
  customerEmail: string | null;
  paymentStatus: string | null;
  amount: number;
  currency: string;
  createdAt: string | null;
  productTitle: string;
  productType: string;
  gameName: string | null;
};

async function loadOrderNotificationContext(
  orderId: string
): Promise<OrderNotificationContext | null> {
  const service = getSupabaseService();

  const { data: order, error: orderError } = await service
    .from("orders")
    .select(
      "id,order_number,customer_email,payment_status,currency,total_amount,total,subtotal,created_at"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    console.error(
      "[admin-order-notification] order load failed:",
      orderError?.message || "not found"
    );
    return null;
  }

  const { data: items } = await service
    .from("order_items")
    .select("product_id,product_title,title_snapshot")
    .eq("order_id", orderId)
    .limit(1);

  const item = items?.[0];
  const productId = item?.product_id?.trim();
  const productTitle =
    item?.title_snapshot?.trim() ||
    item?.product_title?.trim() ||
    "Unknown product";

  let productType = normalizeProductType(null);
  let gameName: string | null = null;

  if (productId) {
    let productResult = await service
      .from("products")
      .select("product_type,game_id,title")
      .eq("id", productId)
      .maybeSingle();

    if (
      productResult.error &&
      /product_type|column|schema/i.test(productResult.error.message)
    ) {
      productResult = await service
        .from("products")
        .select("game_id,title")
        .eq("id", productId)
        .maybeSingle();
    }

    if (productResult.data) {
      productType = normalizeProductType(
        (productResult.data as { product_type?: string }).product_type
      );
      const gameId = productResult.data.game_id;
      if (gameId) {
        const { data: game } = await service
          .from("games")
          .select("name")
          .eq("id", gameId)
          .maybeSingle();
        gameName = game?.name ?? null;
      }
    }
  }

  return {
    orderId: order.id,
    orderNumber: order.order_number ?? null,
    customerEmail: order.customer_email ?? null,
    paymentStatus: order.payment_status ?? null,
    amount: orderAmount(order),
    currency: orderCurrency(order),
    createdAt: order.created_at ?? null,
    productTitle,
    productType,
    gameName,
  };
}

function formatOrderTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-MY", {
      timeZone: "Asia/Kuala_Lumpur",
    });
  } catch {
    return iso;
  }
}

function buildAdminOrderNotificationEmail(ctx: OrderNotificationContext): {
  subject: string;
  html: string;
  text: string;
} {
  const displayId = ctx.orderNumber || ctx.orderId.slice(0, 8);
  const typeLabel = getProductTypeLabel(normalizeProductType(ctx.productType));
  const paymentLabel =
    ctx.paymentStatus === "paid"
      ? "Paid"
      : ctx.paymentStatus || "Unknown";
  const orderTime = formatOrderTime(ctx.createdAt);
  const amountLine = `${ctx.currency} ${ctx.amount.toFixed(2)}`;

  const lines = [
    ["Order ID", displayId],
    ["Product", ctx.productTitle],
    ["Product Type", typeLabel],
    ["Game", ctx.gameName || "—"],
    ["Amount", amountLine],
    ["Customer email", ctx.customerEmail || "—"],
    ["Payment status", paymentLabel],
    ["Order time", orderTime],
  ];

  const text = [
    `New BaituGames order ${displayId}`,
    "",
    ...lines.map(([label, value]) => `${label}: ${value}`),
    "",
    "This notification does not include account credentials.",
  ].join("\n");

  const htmlRows = lines
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#64748b;vertical-align:top;">${label}</td>` +
        `<td style="padding:6px 0;font-weight:500;">${escapeHtml(String(value))}</td></tr>`
    )
    .join("");

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;color:#0f172a;line-height:1.5;">
<p style="font-size:16px;font-weight:600;">New BaituGames order</p>
<table style="border-collapse:collapse;font-size:14px;">${htmlRows}</table>
<p style="margin-top:16px;font-size:12px;color:#64748b;">This notification does not include account credentials.</p>
</body></html>`;

  return {
    subject: `New BaituGames Order #${displayId}`,
    html,
    text,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Send admin new-order notification for paid Endgame / Reroll account orders.
 * Never includes credentials. Failures are logged only — must not block fulfillment.
 */
export async function notifyAdminNewOrder(orderId: string): Promise<void> {
  const adminEmail = process.env.ADMIN_ORDER_NOTIFICATION_EMAIL?.trim();
  if (!adminEmail) {
    return;
  }

  try {
    const ctx = await loadOrderNotificationContext(orderId);
    if (!ctx) return;

    const productType = normalizeProductType(ctx.productType);
    if (!isAccountProductType(productType)) {
      return;
    }

    const email = buildAdminOrderNotificationEmail(ctx);
    const result = await sendTransactionalEmail({
      to: adminEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    if (!result.ok) {
      console.error(
        "[admin-order-notification] send failed:",
        result.error_code,
        "order",
        orderId
      );
    }
  } catch (error) {
    console.error(
      "[admin-order-notification] unexpected:",
      error instanceof Error ? error.message : error
    );
  }
}
