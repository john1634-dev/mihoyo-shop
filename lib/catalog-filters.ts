import {
  PRODUCT_TYPES,
  normalizeProductType,
  type ProductType,
} from "@/lib/product-type";
import type { Game, Product } from "@/lib/types";

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

/** Available listing counts by product type — no extra DB column. */
export function typesWithAvailableListings(
  products: Product[]
): Array<{ type: ProductType; listingCount: number }> {
  const counts: Record<ProductType, number> = {
    ENDGAME_ACCOUNT: 0,
    REROLL_ACCOUNT: 0,
    TOP_UP: 0,
  };

  for (const product of products) {
    if (product.status !== "available") continue;
    const type = normalizeProductType(product.product_type);
    counts[type] += 1;
  }

  return PRODUCT_TYPES.filter((type) => counts[type] > 0).map((type) => ({
    type,
    listingCount: counts[type],
  }));
}

/** Pure storefront filter — matches catalog SQL type + game + available. */
export function filterAvailableProductsByTypeAndGame(
  products: Product[],
  options: { type: ProductType; gameId: string }
): Product[] {
  return products.filter(
    (product) =>
      product.status === "available" &&
      normalizeProductType(product.product_type) === options.type &&
      product.game_id === options.gameId
  );
}
