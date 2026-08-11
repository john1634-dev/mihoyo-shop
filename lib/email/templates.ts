import { SITE_NAME, SITE_URL, buildWhatsAppUrl, formatPrice } from "@/lib/config";
import type { EmailMessage } from "@/lib/email/send";

type OrderEmailInput = {
  customerName: string;
  customerEmail: string;
  orderNumber: string;
  orderId: string;
  status: string;
  paymentStatus: string;
  total: number;
  currency?: string;
  items: Array<{ title: string; price: number; quantity?: number }>;
  createdAt?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function baseLayout(title: string, bodyHtml: string, bodyText: string): EmailMessage {
  const support = buildWhatsAppUrl(
    `Hi ${SITE_NAME}, I need help with my order.`
  );

  const html = `<!doctype html>
<html>
  <body style="font-family:Arial,sans-serif;background:#020617;color:#e2e8f0;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:24px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#fff;">${escapeHtml(title)}</h1>
      ${bodyHtml}
      <p style="margin-top:24px;font-size:13px;color:#94a3b8;">
        Visit <a href="${SITE_URL}" style="color:#60a5fa;">${escapeHtml(SITE_NAME)}</a>
        ${support ? ` · <a href="${support}" style="color:#4ade80;">WhatsApp Support</a>` : ""}
      </p>
    </div>
  </body>
</html>`;

  const text = `${title}

${bodyText}

Website: ${SITE_URL}
${support ? `WhatsApp: ${support}` : ""}
`;

  return { to: "", subject: title, html, text };
}

function orderBlocks(input: OrderEmailInput) {
  const currency = input.currency || "MYR";
  const itemLines = input.items
    .map(
      (item) =>
        `• ${item.title} — ${formatPrice(Number(item.price), currency)}`
    )
    .join("\n");

  const itemHtml = input.items
    .map(
      (item) =>
        `<li style="margin:0 0 8px;">${escapeHtml(item.title)} — ${escapeHtml(
          formatPrice(Number(item.price), currency)
        )}</li>`
    )
    .join("");

  const html = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(input.customerName || "there")},</p>
    <p style="margin:0 0 16px;color:#94a3b8;">Here are your order details from ${escapeHtml(SITE_NAME)}.</p>
    <ul style="padding-left:18px;margin:0 0 16px;color:#cbd5e1;">
      <li>Order ID: <strong style="color:#fff;">${escapeHtml(input.orderNumber)}</strong></li>
      <li>Status: ${escapeHtml(input.status)}</li>
      <li>Payment: ${escapeHtml(input.paymentStatus)}</li>
      <li>Total: <strong style="color:#fff;">${escapeHtml(formatPrice(input.total, currency))}</strong></li>
      ${input.createdAt ? `<li>Date: ${escapeHtml(new Date(input.createdAt).toLocaleString("en-MY"))}</li>` : ""}
    </ul>
    <p style="margin:0 0 8px;color:#94a3b8;">Products</p>
    <ul style="padding-left:18px;margin:0;color:#cbd5e1;">${itemHtml}</ul>
  `;

  const text = `Hi ${input.customerName || "there"},

Order ID: ${input.orderNumber}
Status: ${input.status}
Payment: ${input.paymentStatus}
Total: ${formatPrice(input.total, currency)}
${input.createdAt ? `Date: ${new Date(input.createdAt).toLocaleString("en-MY")}` : ""}

Products:
${itemLines}
`;

  return { html, text };
}

export function buildOrderCreatedEmail(input: OrderEmailInput): EmailMessage {
  const blocks = orderBlocks(input);
  const message = baseLayout(
    `${SITE_NAME} — Order Created`,
    blocks.html,
    blocks.text
  );
  return { ...message, to: input.customerEmail };
}

export function buildPaymentConfirmedEmail(input: OrderEmailInput): EmailMessage {
  const blocks = orderBlocks(input);
  const message = baseLayout(
    `${SITE_NAME} — Payment Confirmed`,
    `<p style="margin:0 0 12px;color:#4ade80;">Your payment status is now paid.</p>${blocks.html}`,
    `Your payment status is now paid.\n\n${blocks.text}`
  );
  return { ...message, to: input.customerEmail };
}

export function buildPaymentFailedEmail(input: OrderEmailInput): EmailMessage {
  const blocks = orderBlocks(input);
  const message = baseLayout(
    `${SITE_NAME} — Payment Failed`,
    `<p style="margin:0 0 12px;color:#f87171;">Unfortunately your payment could not be processed. Please contact support if you need help.</p>${blocks.html}`,
    `Unfortunately your payment could not be processed.\n\n${blocks.text}`
  );
  return { ...message, to: input.customerEmail };
}

export function buildOrderCompletedEmail(input: OrderEmailInput): EmailMessage {
  const blocks = orderBlocks(input);
  const message = baseLayout(
    `${SITE_NAME} — Order Completed`,
    `<p style="margin:0 0 12px;color:#4ade80;">Your order is completed. Thank you for shopping with us.</p>${blocks.html}`,
    `Your order is completed. Thank you for shopping with us.\n\n${blocks.text}`
  );
  return { ...message, to: input.customerEmail };
}
