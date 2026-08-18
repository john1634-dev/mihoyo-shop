import Link from "next/link";
import Navbar from "@/components/Navbar";
import ProductCard from "@/components/ProductCard";
import GameCategoryCard from "@/components/GameCategoryCard";
import TrustBar from "@/components/TrustBar";
import FindAccountCTA from "@/components/FindAccountCTA";
import HomeCategoryCards from "@/components/HomeCategoryCards";
import { SITE_NAME } from "@/lib/config";
import {
  buildAccountCounts,
  buildGameNameMap,
  fetchActiveGames,
  fetchAvailableProducts,
  fetchRecentlySoldProducts,
} from "@/lib/catalog-server";
import { fetchProductStockSummaryMap } from "@/lib/catalog-stock-server";
import { getRecommendedProducts } from "@/lib/products-public";
import {
  isAccountProductType,
  isWhatsAppOnlyProductType,
  normalizeProductType,
} from "@/lib/product-type";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

const WHY_US = [
  {
    title: "Verified listings",
    body: "Accounts are prepared with screenshots, pricing, and availability before you buy.",
  },
  {
    title: "Card, Shopee, or WhatsApp",
    body: "Pay by card through Stripe, continue on Shopee, or message us on WhatsApp.",
  },
  {
    title: "Fast support",
    body: "WhatsApp is the fastest way to confirm a listing or request a top up.",
  },
];

function ProductSection({
  title,
  subtitle,
  products,
  viewAllHref,
  viewAllLabel,
  gameNameById,
  stockSummaryByProductId,
}: {
  title: string;
  subtitle: string;
  products: Product[];
  viewAllHref: string;
  viewAllLabel: string;
  gameNameById: Map<string, string>;
  stockSummaryByProductId?: Record<
    string,
    import("@/lib/inventory-stock").ProductStockSummary
  >;
}) {
  if (products.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6 md:py-12">
      <div className="mb-6 flex items-end justify-between gap-4 md:mb-8">
        <div>
          <h2 className="section-title">{title}</h2>
          <p className="section-subtitle">{subtitle}</p>
        </div>
        <Link
          href={viewAllHref}
          className="shrink-0 text-sm font-medium text-[var(--accent-strong)] transition hover:text-[var(--accent)]"
        >
          {viewAllLabel}
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            gameNameById={gameNameById}
            stockSummary={stockSummaryByProductId?.[product.id]}
          />
        ))}
      </div>
    </section>
  );
}

export default async function Home() {
  const [games, products, recentlySold] = await Promise.all([
    fetchActiveGames(),
    fetchAvailableProducts(),
    fetchRecentlySoldProducts(),
  ]);

  const stockSummaryByProductId = await fetchProductStockSummaryMap(
    products.map((product) => product.id)
  );
  const accountCounts = buildAccountCounts(products, stockSummaryByProductId);
  const gameNameById = buildGameNameMap(games);
  const stockedGames = games.filter((game) => (accountCounts[game.id] || 0) > 0);
  const popularGames = stockedGames.length > 0 ? stockedGames : games;

  const accountProducts = products.filter((product) =>
    isAccountProductType(normalizeProductType(product.product_type))
  );
  const recommendedProducts = getRecommendedProducts(accountProducts);
  const recentlySoldAccounts = recentlySold.filter(
    (product) =>
      !isWhatsAppOnlyProductType(normalizeProductType(product.product_type))
  );

  return (
    <main className="storefront-main flex min-h-screen flex-col">
      <Navbar games={games} />

      <section className="hero-premium hero-compact relative">
        <div className="hero-grid-decoration" aria-hidden />
        <div className="relative mx-auto flex w-full max-w-7xl flex-col justify-center px-4 py-10 md:px-6 md:py-14 lg:py-16">
          <p className="eyebrow">{SITE_NAME}</p>

          <h1 className="hero-title mt-5 max-w-3xl">
            Game accounts and top up,
            <span className="mt-1 block text-[var(--muted-strong)]">
              in one marketplace.
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-sm leading-relaxed text-[var(--muted)] md:text-base">
            Buy premium endgame and reroll accounts, or top up your game through
            WhatsApp.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/products" className="btn-primary min-h-12 px-6">
              Browse Accounts
            </Link>
            <FindAccountCTA
              games={games}
              variant="secondary"
              label="Find an Account"
            />
          </div>
        </div>
      </section>

      <HomeCategoryCards />

      <section
        id="popular-games"
        className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6 md:py-12"
      >
        <div>
          <h2 className="section-title">Popular Games</h2>
          <p className="section-subtitle">Browse live listings by title</p>
        </div>

        {games.length === 0 && (
          <p className="mt-6 text-[var(--muted)]">No games available.</p>
        )}

        {popularGames.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {popularGames.map((game) => (
              <GameCategoryCard
                key={game.id}
                game={game}
                accountCount={accountCounts[game.id] || 0}
              />
            ))}
          </div>
        )}
      </section>

      <ProductSection
        title="Featured accounts"
        subtitle="Available endgame and reroll listings"
        products={recommendedProducts}
        viewAllHref="/products"
        viewAllLabel="View all"
        gameNameById={gameNameById}
        stockSummaryByProductId={stockSummaryByProductId}
      />

      {recentlySoldAccounts.length > 0 ? (
        <section className="storefront-section-alt border-y border-[var(--border)]">
          <ProductSection
            title="Recently Sold"
            subtitle="Accounts that have already found a new owner"
            products={recentlySoldAccounts}
            viewAllHref="/products?status=sold"
            viewAllLabel="View sold"
            gameNameById={gameNameById}
          />
        </section>
      ) : null}

      <section className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6 md:py-12">
        <div className="rounded-2xl border border-[var(--border)] bg-white px-5 py-8 text-center shadow-[var(--shadow-card)] sm:px-8">
          <h2 className="section-title">Find me an account</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--muted)]">
            Tell us the game, budget, and what you need. We will open WhatsApp
            with your request — no order is created.
          </p>
          <div className="mt-6 flex justify-center">
            <FindAccountCTA
              games={games}
              variant="whatsapp"
              label="Find Me an Account"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-8 md:px-6">
        <h2 className="section-title">Why buy from {SITE_NAME}</h2>
        <p className="section-subtitle">Clear listings, secure checkout, fast replies</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {WHY_US.map((item) => (
            <div key={item.title} className="surface-card p-4 sm:p-5">
              <h3 className="font-semibold text-[var(--foreground)]">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <TrustBar />
    </main>
  );
}
