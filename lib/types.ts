
export type Game = {
  id: string;
  name: string;
  slug: string;
  description: string | null;

  // Game images
  image_url: string | null;
  logo_url: string | null;
  banner_url: string | null;
  mobile_banner_url: string | null;

  is_active?: boolean;
  sort_order?: number;
};

export type Product = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  price: number;
  currency: string;
  status: string;
  server: string | null;
  ar_level: number | null;
  cover_image_url: string | null;
  game_id: string | null;
  created_at?: string;
  /** Optional product-specific Shopee listing URL */
  shopee_url?: string | null;
  /** Admin-only fields */
  supplier_cost?: number | null;
  supplier_name?: string | null;
};

/** Product row with admin-only supplier fields (e.g. edit forms). */
export type AdminProduct = Product & {
  supplier_cost: number | null;
  supplier_name: string | null;
};

export type ProductImage = {
  id: string;
  product_id: string;
  image_url: string;
  image_path: string;
  sort_order: number;
};

export type Order = {
  id: string;
  order_number?: string | null;
  customer_id?: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_whatsapp: string | null;
  status: string | null;
  order_status?: string | null;
  total_amount: number | null;
  discount_amount?: number | null;
  currency: string | null;
  payment_method: string | null;
  payment_status: string | null;
  customer_note: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_title: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string | null;
};
