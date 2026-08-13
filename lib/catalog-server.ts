import { supabase } from "@/lib/supabase";
import {
  PUBLIC_PRODUCT_SELECT,
  PUBLIC_PRODUCT_SELECT_LEGACY,
} from "@/lib/products-public";
import {
  normalizeCurrencyCode,
  normalizeRegionCode,
} from "@/lib/catalog-meta";
import type { Game, Product } from "@/lib/types";

export const GAME_PUBLIC_SELECT =
  "id,name,slug,description,image_url,logo_url,banner_url,mobile_banner_url,is_active,sort_order";

export type ProductListFilters = {
  game?: string;
  q?: string;
  sort?: string;
  status?: string;
  region?: string;
  currency?: string;
  server?: string;
};

/** Maps legacy `featured` / `default` URLs to newest-first ordering. */
export function normalizeProductSort(sort?: string): string {
  if (!sort || sort === "featured" || sort === "default") return "newest";
  return sort;
}

export function buildGameNameMap(games: Game[]): Map<string, string> {
  return new Map(games.map((game) => [game.id, game.name]));
}

function isMissingRegionColumnError(message?: string): boolean {
  if (!message) return false;
  return /region_code/i.test(message) && /column|schema|exist/i.test(message);
}

type ProductQueryBuilder = ReturnType<
  ReturnType<typeof supabase.from>["select"]
>;

function sanitizeSearchTerm(value: string): string {
  return value.replace(/[%_,.()"'\\]/g, " ").replace(/\s+/g, " ").trim();
}

function applyProductFilters(
  query: ProductQueryBuilder,
  filters: ProductListFilters,
  games: Game[] | undefined,
  options: { includeRegionFilter: boolean }
) {
  const gameSlug = filters.game?.trim() || "";
  const searchQuery = sanitizeSearchTerm(filters.q?.trim() || "");
  const sort = normalizeProductSort(filters.sort);
  const statusFilter = filters.status || "available";
  const regionCode = normalizeRegionCode(filters.region);
  const currencyCode = filters.currency
    ? normalizeCurrencyCode(filters.currency, "")
    : "";
  const serverFilter = filters.server?.trim() || "";

  let next = query;

  if (gameSlug) {
    const gameList = games;
    const matchedGame = gameList?.find((game) => game.slug === gameSlug);
    if (matchedGame) {
      next = next.eq("game_id", matchedGame.id);
    }
  }

  if (searchQuery) {
    next = next.or(
      `title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`
    );
  }

  if (statusFilter === "available") {
    next = next.eq("status", "available");
  } else if (statusFilter === "sold") {
    next = next.eq("status", "sold");
  } else {
    next = next.in("status", ["available", "sold"]);
  }

  if (options.includeRegionFilter && regionCode) {
    next = next.eq("region_code", regionCode);
  }

  if (currencyCode) {
    next = next.ilike("currency", currencyCode);
  }

  if (serverFilter) {
    next = next.ilike("server", `%${sanitizeSearchTerm(serverFilter)}%`);
  }

  if (sort === "price-asc") {
    next = next.order("price", { ascending: true });
  } else if (sort === "price-desc") {
    next = next.order("price", { ascending: false });
  } else {
    next = next.order("created_at", { ascending: false });
  }

  return next;
}

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
  const primary = await supabase
    .from("products")
    .select(PUBLIC_PRODUCT_SELECT)
    .eq("status", "available")
    .order("created_at", { ascending: false });

  if (!primary.error) {
    return (primary.data || []) as Product[];
  }

  if (isMissingRegionColumnError(primary.error.message)) {
    console.warn(
      "[catalog] region_code missing — using legacy select until migration is applied"
    );
    const fallback = await supabase
      .from("products")
      .select(PUBLIC_PRODUCT_SELECT_LEGACY)
      .eq("status", "available")
      .order("created_at", { ascending: false });

    if (fallback.error) {
      console.error("[catalog] fetchAvailableProducts:", fallback.error.message);
      return [];
    }

    return (fallback.data || []) as Product[];
  }

  console.error("[catalog] fetchAvailableProducts:", primary.error.message);
  return [];
}

export async function fetchFilteredProducts(
  filters: ProductListFilters,
  games?: Game[]
): Promise<Product[]> {
  const gameList = games ?? (await fetchActiveGames());

  const primaryQuery = applyProductFilters(
    supabase.from("products").select(PUBLIC_PRODUCT_SELECT),
    filters,
    gameList,
    { includeRegionFilter: true }
  );

  const primary = await primaryQuery;

  if (!primary.error) {
    return (primary.data || []) as Product[];
  }

  if (isMissingRegionColumnError(primary.error.message)) {
    console.warn(
      "[catalog] region_code missing — region filter ignored until migration is applied"
    );
    const fallbackQuery = applyProductFilters(
      supabase.from("products").select(PUBLIC_PRODUCT_SELECT_LEGACY),
      filters,
      gameList,
      { includeRegionFilter: false }
    );
    const fallback = await fallbackQuery;

    if (fallback.error) {
      console.error("[catalog] fetchFilteredProducts:", fallback.error.message);
      return [];
    }

    return (fallback.data || []) as Product[];
  }

  console.error("[catalog] fetchFilteredProducts:", primary.error.message);
  return [];
}

export function buildAccountCounts(
  products: Product[],
  stockByProductId?: Record<string, number>
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const product of products) {
    if (!product.game_id) continue;
    const stock =
      stockByProductId && product.id in stockByProductId
        ? stockByProductId[product.id] ?? 0
        : product.status === "available"
          ? 1
          : 0;
    if (stock > 0) {
      counts[product.game_id] = (counts[product.game_id] || 0) + stock;
    }
  }

  return counts;
}
