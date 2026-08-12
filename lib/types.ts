
export type Game = {
  id: string;
  name: string;
  slug: string;
  description: string | null;

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
  shopee_url?: string | null;
  supplier_cost?: number | null;
  supplier_name?: string | null;
};

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
