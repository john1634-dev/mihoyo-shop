import type { CartItem } from "./types";

export type PlaceOrderInput = {
  customerName: string;
  customerEmail: string;
  customerWhatsapp: string;
  customerNote: string;
  paymentMethod: string;
  items: CartItem[];
};

export type PlaceOrderResult = {
  order_id: string;
  order_number: string;
  total: number;
  currency: string;
  customer_id?: string | null;
  customer_email?: string;
  items: Array<{
    product_id: string;
    title: string;
    price: number;
    quantity: number;
    image?: string | null;
  }>;
};

export type OrderReceipt = {
  order_id: string;
  order_number: string;
  customer_id?: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_whatsapp: string | null;
  total: number;
  currency: string;
  status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  created_at: string | null;
  items: Array<{
    title: string;
    quantity: number;
    price: number;
    subtotal: number;
    product_id?: string | null;
    image?: string | null;
  }>;
};

export function buildPurchaseWhatsAppMessage(input: {
  orderNumber?: string;
  customerName: string;
  customerEmail: string;
  customerWhatsapp: string;
  items: Array<{ title: string; price: number; quantity?: number }>;
  total: number;
  currency?: string;
}): string {
  const currency = input.currency || "MYR";
  const lines = [
    `Hello, I would like to purchase:`,
    "",
    ...input.items.map(
      (item) =>
        `• ${item.title} — ${currency} ${Number(item.price).toFixed(2)}`
    ),
    "",
    `Total: ${currency} ${Number(input.total).toFixed(2)}`,
  ];

  if (input.orderNumber) {
    lines.push(`Order ID: ${input.orderNumber}`);
  }

  lines.push(
    `Email: ${input.customerEmail}`,
    `WhatsApp: ${input.customerWhatsapp}`,
    `Name: ${input.customerName}`
  );

  return lines.join("\n");
}
