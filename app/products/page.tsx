import type { Metadata } from "next";
import ProductsClient from "@/components/ProductsClient";
import {
  fetchActiveGames,
  fetchFilteredProducts,
  gamesWithAvailableListings,
  normalizeProductSort,
} from "@/lib/catalog-server";
import { fetchProductStockSummaryMap } from "@/lib/catalog-stock-server";
import {
  normalizeCurrencyCode,
  normalizeRegionCode,
} from "@/lib/catalog-meta";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/config";
import { parseStorefrontProductTypeFilter } from "@/lib/product-type";
import { OG_IMAGE_PATH, absoluteUrl, productsHasActiveFilters } from "@/lib/seo";

export const dynamic = "force-dynamic";

type ProductsSearchParams = {
  game?: string;
  q?: string;
  sort?: string;
  status?: string;
  region?: string;
  currency?: string;
  server?: string;
  type?: string;
};

type ProductsPageProps = {
  searchParams: Promise<ProductsSearchParams>;
};

const PRODUCTS_CANONICAL = `${SITE_URL.replace(/\/$/, "")}/products`;

export async function generateMetadata({
  searchParams,
}: ProductsPageProps): Promise<Metadata> {
  const params = await searchParams;
  const filtered = productsHasActiveFilters(params);

  return {
    title: "Game Accounts",
    description: SITE_DESCRIPTION,
    alternates: {
      canonical: PRODUCTS_CANONICAL,
    },
    robots: filtered
      ? { index: false, follow: true }
      : { index: true, follow: true },
    openGraph: {
      title: `Game Accounts | ${SITE_NAME}`,
      description: SITE_DESCRIPTION,
      url: PRODUCTS_CANONICAL,
      type: "website",
      siteName: SITE_NAME,
      images: [
        { url: absoluteUrl(OG_IMAGE_PATH), alt: `${SITE_NAME} — Game Accounts` },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `Game Accounts | ${SITE_NAME}`,
      description: SITE_DESCRIPTION,
      images: [absoluteUrl(OG_IMAGE_PATH)],
    },
  };
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;

  const gameSlug = params.game?.trim() || "";
  const searchQuery = params.q?.trim() || "";
  const sort = normalizeProductSort(params.sort?.trim());
  const statusFilter = params.status?.trim() || "available";
  const regionCode = normalizeRegionCode(params.region) || "";
  const currencyCode = params.currency?.trim()
    ? normalizeCurrencyCode(params.currency, "")
    : "";
  const serverFilter = params.server?.trim() || "";
  const typeFilter = parseStorefrontProductTypeFilter(params.type);

  const games = await fetchActiveGames();
  const [products, typeAvailableProducts] = await Promise.all([
    fetchFilteredProducts(
      {
        game: gameSlug,
        q: searchQuery,
        sort,
        status: statusFilter,
        region: regionCode || undefined,
        currency: currencyCode || undefined,
        server: serverFilter || undefined,
        type: typeFilter || undefined,
      },
      games
    ),
    typeFilter
      ? fetchFilteredProducts(
          {
            type: typeFilter,
            status: "available",
          },
          games
        )
      : Promise.resolve([]),
  ]);

  const typeScopedGames = typeFilter
    ? gamesWithAvailableListings(games, typeAvailableProducts)
    : [];
  const stockSummaryByProductId = await fetchProductStockSummaryMap(
    products.map((product) => product.id)
  );

  return (
    <ProductsClient
      games={games}
      products={products}
      stockSummaryByProductId={stockSummaryByProductId}
      gameSlug={gameSlug}
      searchQuery={searchQuery}
      sort={sort}
      statusFilter={statusFilter}
      regionCode={regionCode}
      currencyCode={currencyCode}
      serverFilter={serverFilter}
      typeFilter={typeFilter}
      typeScopedGames={typeScopedGames}
    />
  );
}
