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
