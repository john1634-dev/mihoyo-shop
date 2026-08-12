import { supabase } from "@/lib/supabase";
import { PUBLIC_PRODUCT_SELECT } from "@/lib/products-public";
import type { Game, Product } from "@/lib/types";

export const GAME_PUBLIC_SELECT =
  "id,name,slug,description,image_url,logo_url,banner_url,mobile_banner_url,is_active,sort_order";

export type ProductListFilters = {
  game?: string;
  q?: string;
  sort?: string;
  status?: string;
};

export async function fetchActiveGames(): Promise<Game[]> {
  const { data, error } = await supabase
    .from("games")
    .select(GAME_PUBLIC_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[catalog] fetchActiveGames:", error.message);
    return [];
  }

  return (data || []) as Game[];
}

export async function fetchAvailableProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select(PUBLIC_PRODUCT_SELECT)
    .eq("status", "available")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[catalog] fetchAvailableProducts:", error.message);
    return [];
  }

  return (data || []) as Product[];
}

export async function fetchFilteredProducts(
  filters: ProductListFilters,
  games?: Game[]
): Promise<Product[]> {
  const gameSlug = filters.game?.trim() || "";
  const searchQuery = filters.q?.trim() || "";
  const sort = filters.sort || "featured";
  const statusFilter = filters.status || "available";

  let query = supabase.from("products").select(PUBLIC_PRODUCT_SELECT);

  if (gameSlug) {
    const gameList = games ?? (await fetchActiveGames());
    const matchedGame = gameList.find((game) => game.slug === gameSlug);
    if (matchedGame) {
      query = query.eq("game_id", matchedGame.id);
    }
  }

  if (searchQuery) {
    query = query.ilike("title", `%${searchQuery}%`);
  }

  if (statusFilter === "available") {
    query = query.eq("status", "available");
  } else if (statusFilter === "sold") {
    query = query.eq("status", "sold");
  } else {
    query = query.in("status", ["available", "sold"]);
  }

  if (sort === "price-asc") {
    query = query.order("price", { ascending: true });
  } else if (sort === "price-desc") {
    query = query.order("price", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    console.error("[catalog] fetchFilteredProducts:", error.message);
    return [];
  }

  return (data || []) as Product[];
}

export function buildAccountCounts(products: Product[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const product of products) {
    if (product.game_id) {
      counts[product.game_id] = (counts[product.game_id] || 0) + 1;
    }
  }

  return counts;
}
