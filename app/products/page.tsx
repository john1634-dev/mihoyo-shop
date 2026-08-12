import ProductsClient from "@/components/ProductsClient";
import {
  fetchActiveGames,
  fetchFilteredProducts,
} from "@/lib/catalog-server";

export const dynamic = "force-dynamic";

type ProductsPageProps = {
  searchParams: Promise<{
    game?: string;
    q?: string;
    sort?: string;
    status?: string;
  }>;
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;

  const gameSlug = params.game?.trim() || "";
  const searchQuery = params.q?.trim() || "";
  const sort = params.sort?.trim() || "featured";
  const statusFilter = params.status?.trim() || "available";

  const games = await fetchActiveGames();
  const products = await fetchFilteredProducts(
    {
      game: gameSlug,
      q: searchQuery,
      sort,
      status: statusFilter,
    },
    games
  );

  return (
    <ProductsClient
      games={games}
      products={products}
      gameSlug={gameSlug}
      searchQuery={searchQuery}
      sort={sort}
      statusFilter={statusFilter}
    />
  );
}
