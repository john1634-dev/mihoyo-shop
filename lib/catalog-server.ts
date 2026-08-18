import {
  isInventoryManagedProduct,
  type ProductStockSummary,
} from "@/lib/inventory-stock";
import { supabase } from "@/lib/supabase";
import {
  PUBLIC_PRODUCT_SELECT,
  PUBLIC_PRODUCT_SELECT_LEGACY,
  PUBLIC_RECENTLY_SOLD_SELECT,
  PUBLIC_RECENTLY_SOLD_SELECT_LEGACY,
} from "@/lib/products-public";
import {
  normalizeCurrencyCode,
  normalizeRegionCode,
} from "@/lib/catalog-meta";
import { parseStorefrontProductTypeFilter } from "@/lib/product-type";
import type { Game, Product } from "@/lib/types";

export const GAME_PUBLIC_SELECT =
  "id,name,slug,description,image_url,logo_url,banner_url,mobile_banner_url,is_active,sort_order";

/** Minimum genuine sold listings before showing Recently Sold on the storefront. */
export const RECENTLY_SOLD_MIN_COUNT = 2;
export const RECENTLY_SOLD_LIMIT = 8;

export type ProductListFilters = {
  game?: string;
  q?: string;
  sort?: string;
  status?: string;
  region?: string;
  currency?: string;
  server?: string;
  type?: string;
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

function isMissingOptionalColumnError(message?: string): boolean {
  if (!message) return false;
  return (
    (/shopee_url|updated_at|product_type/i.test(message) &&
      /column|schema|exist/i.test(message)) ||
    isMissingRegionColumnError(message)
  );
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
  options: { includeRegionFilter: boolean; includeProductTypeFilter?: boolean }
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
  const productType = parseStorefrontProductTypeFilter(filters.type);

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

  if (options.includeProductTypeFilter && productType) {
    next = next.eq("product_type", productType);
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

  if (isMissingOptionalColumnError(primary.error.message)) {
    console.warn(
      "[catalog] optional product columns missing — using legacy select"
    );
    const fallback = await supabase
      .from("products")
      .select(PUBLIC_PRODUCT_SELECT_LEGACY)
      .eq("status", "available")
      .order("created_at", { ascending: false });

    if (!fallback.error) {
      return (fallback.data || []) as Product[];
    }

    const minimal = await supabase
      .from("products")
      .select(
        "id,title,slug,description,price,currency,status,server,ar_level,cover_image_url,game_id,created_at"
      )
      .eq("status", "available")
      .order("created_at", { ascending: false });

    if (minimal.error) {
      console.error("[catalog] fetchAvailableProducts:", minimal.error.message);
      return [];
    }

    return (minimal.data || []) as Product[];
  }

  console.error("[catalog] fetchAvailableProducts:", primary.error.message);
  return [];
}

/**
 * Genuinely sold listings for social proof.
 * Source of truth: products.status = 'sold' (admin Mark Sold / legacy checkout).
 * Sorted by updated_at (proxy for when status last changed — no sold_at column).
 * Returns [] when fewer than RECENTLY_SOLD_MIN_COUNT results so UI can hide the section.
 * Never joins orders — no customer PII.
 */
export async function fetchRecentlySoldProducts(
  limit = RECENTLY_SOLD_LIMIT
): Promise<Product[]> {
  const primary = await supabase
    .from("products")
    .select(PUBLIC_RECENTLY_SOLD_SELECT)
    .eq("status", "sold")
    .order("updated_at", { ascending: false })
    .limit(limit);

  let rows: Product[] = [];

  if (!primary.error) {
    rows = (primary.data || []) as Product[];
  } else if (isMissingOptionalColumnError(primary.error.message)) {
    const fallback = await supabase
      .from("products")
      .select(PUBLIC_RECENTLY_SOLD_SELECT_LEGACY)
      .eq("status", "sold")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (!fallback.error) {
      rows = (fallback.data || []) as Product[];
    } else {
      const byCreated = await supabase
        .from("products")
        .select(
          "id,title,slug,price,currency,status,server,ar_level,cover_image_url,game_id,created_at"
        )
        .eq("status", "sold")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (byCreated.error) {
        console.error("[catalog] fetchRecentlySoldProducts:", byCreated.error.message);
        return [];
      }
      rows = (byCreated.data || []) as Product[];
    }
  } else {
    console.error("[catalog] fetchRecentlySoldProducts:", primary.error.message);
    return [];
  }

  if (rows.length < RECENTLY_SOLD_MIN_COUNT) {
    return [];
  }

  return rows;
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
    { includeRegionFilter: true, includeProductTypeFilter: true }
  );

  const primary = await primaryQuery;

  if (!primary.error) {
    return (primary.data || []) as Product[];
  }

  if (isMissingOptionalColumnError(primary.error.message)) {
    console.warn(
      "[catalog] optional product columns missing — using legacy select"
    );
    const fallbackQuery = applyProductFilters(
      supabase.from("products").select(PUBLIC_PRODUCT_SELECT_LEGACY),
      filters,
      gameList,
      { includeRegionFilter: false }
    );
    const fallback = await fallbackQuery;

    if (!fallback.error) {
      return (fallback.data || []) as Product[];
    }

    const minimalQuery = applyProductFilters(
      supabase
        .from("products")
        .select(
          "id,title,slug,description,price,currency,status,server,ar_level,cover_image_url,game_id,created_at"
        ),
      filters,
      gameList,
      { includeRegionFilter: false }
    );
    const minimal = await minimalQuery;

    if (minimal.error) {
      console.error("[catalog] fetchFilteredProducts:", minimal.error.message);
      return [];
    }

    return (minimal.data || []) as Product[];
  }

  console.error("[catalog] fetchFilteredProducts:", primary.error.message);
  return [];
}

export function buildAccountCounts(
  products: Product[],
  stockSummaryByProductId?: Record<string, ProductStockSummary>
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const product of products) {
    if (!product.game_id) continue;

    const summary = stockSummaryByProductId?.[product.id];
    const inventoryManaged = isInventoryManagedProduct(summary);

    const stock = inventoryManaged
      ? summary!.available_count
      : product.status === "available"
        ? 1
        : 0;

    if (stock > 0) {
      counts[product.game_id] = (counts[product.game_id] || 0) + stock;
    }
  }

  return counts;
}

/** Count available listings per game (one product row = one listing). */
export function buildListingCountsByGame(
  products: Product[]
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const product of products) {
    if (!product.game_id) continue;
    if (product.status !== "available") continue;
    counts[product.game_id] = (counts[product.game_id] || 0) + 1;
  }

  return counts;
}

export function gamesWithAvailableListings(
  games: Game[],
  products: Product[]
): Array<{ game: Game; listingCount: number }> {
  const counts = buildListingCountsByGame(products);
  return games
    .filter((game) => (counts[game.id] || 0) > 0)
    .map((game) => ({
      game,
      listingCount: counts[game.id],
    }));
}
