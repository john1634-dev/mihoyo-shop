import Link from "next/link";
import Navbar from "@/components/Navbar";
import ProductCard from "@/components/ProductCard";
import GameCategoryCard from "@/components/GameCategoryCard";
import TrustBar from "@/components/TrustBar";
import FindAccountCTA from "@/components/FindAccountCTA";
import { SITE_NAME } from "@/lib/config";
import {
  buildAccountCounts,
  buildGameNameMap,
  fetchActiveGames,
  fetchAvailableProducts,
  fetchRecentlySoldProducts,
} from "@/lib/catalog-server";
import { fetchProductStockSummaryMap } from "@/lib/catalog-stock-server";
import {
  isWhatsAppOnlyProductType,
  normalizeProductType,
  storefrontProductTypeHref,
  type ProductType,
} from "@/lib/product-type";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

const HOME_TYPE_LIMIT = 3;

const TYPE_SECTIONS: Array<{
  type: ProductType;
  kicker: string;
  title: string;
  subtitle: string;
  viewAllLabel: string;
  kickerClass: string;
  ruleClass: string;
}> = [
  {
    type: "ENDGAME_ACCOUNT",
    kicker: "Endgame",
    title: "Endgame Accounts",
    subtitle: "Premium high-level game accounts ready to play.",
    viewAllLabel: "View All Endgame Accounts →",
    kickerClass: "text-blue-700",
    ruleClass: "border-blue-200",
  },
  {
    type: "REROLL_ACCOUNT",
    kicker: "Reroll",
    title: "Reroll Accounts",
    subtitle: "Fresh-start and reroll accounts for a new beginning.",
    viewAllLabel: "View All Reroll Accounts →",
    kickerClass: "text-indigo-700",
    ruleClass: "border-indigo-200",
  },
  {
    type: "TOP_UP",
    kicker: "Top Up",
    title: "Game Top Up",
    subtitle: "Fast and easy game top up through WhatsApp.",
    viewAllLabel: "View All Top Up →",
    kickerClass: "text-emerald-700",
    ruleClass: "border-emerald-200",
  },
];

function productsForType(products: Product[], type: ProductType): Product[] {
  return products
    .filter(
      (product) =>
        product.status === "available" &&
        normalizeProductType(product.product_type) === type
    )
    .slice(0, HOME_TYPE_LIMIT);
}

function ProductTypeSection({
  kicker,
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  kickerClass,
  ruleClass,
  products,
  gameNameById,
  stockSummaryByProductId,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  viewAllHref: string;
  viewAllLabel: string;
  kickerClass: string;
  ruleClass: string;
  products: Product[];
  gameNameById: Map<string, string>;
  stockSummaryByProductId?: Record<
    string,
    import("@/lib/inventory-stock").ProductStockSummary
  >;
}) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <div className={`border-t-2 pt-4 ${ruleClass}`}>
        <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p
              className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${kickerClass}`}
            >
              {kicker}
            </p>
            <h2 className="home-dept-title mt-1">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              {subtitle}
            </p>
          </div>
          <Link
            href={viewAllHref}
            className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-[var(--accent-strong)] transition hover:text-[var(--accent)] sm:min-h-10"
          >
            {viewAllLabel}
          </Link>
        </div>

        {products.length === 0 ? (
          <p className="border border-dashed border-[var(--border)] bg-white px-4 py-6 text-center text-sm text-[var(--muted)]">
            No listings available yet.
          </p>
        ) : (
          <div className="home-product-grid grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                gameNameById={gameNameById}
                stockSummary={stockSummaryByProductId?.[product.id]}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ProductSection({
  title,
  subtitle,
  products,
  viewAllHref,
  viewAllLabel,
  gameNameById,
}: {
  title: string;
  subtitle: string;
  products: Product[];
  viewAllHref: string;
  viewAllLabel: string;
  gameNameById: Map<string, string>;
}) {
  if (products.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <div className="mb-4 flex items-end justify-between gap-4 md:mb-5">
        <div>
          <h2 className="home-dept-title">{title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{subtitle}</p>
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
  const recentlySoldAccounts = recentlySold.filter(
    (product) =>
      !isWhatsAppOnlyProductType(normalizeProductType(product.product_type))
  );

  return (
    <main className="storefront-main flex min-h-screen flex-col">
      <Navbar games={games} />

      <section className="hero-premium hero-compact relative">
        <div className="relative mx-auto flex w-full max-w-7xl flex-col justify-center px-4 py-4 md:px-6 md:py-6">
          <p className="eyebrow">{SITE_NAME}</p>

          <h1 className="hero-title mt-2 max-w-2xl">
            Game accounts and top up, in one marketplace.
          </h1>

          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
            Buy premium endgame and reroll accounts, or top up your game through
            WhatsApp.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/products" className="btn-primary min-h-10 px-4 text-sm">
              Browse Accounts
            </Link>
            <FindAccountCTA
              games={games}
              variant="secondary"
              label="Find an Account"
              compact
            />
          </div>
        </div>
      </section>

      {TYPE_SECTIONS.map((section) => (
        <ProductTypeSection
          key={section.type}
          kicker={section.kicker}
          title={section.title}
          subtitle={section.subtitle}
          viewAllHref={storefrontProductTypeHref(section.type)}
          viewAllLabel={section.viewAllLabel}
          kickerClass={section.kickerClass}
          ruleClass={section.ruleClass}
          products={productsForType(products, section.type)}
          gameNameById={gameNameById}
          stockSummaryByProductId={stockSummaryByProductId}
        />
      ))}

      {popularGames.length > 0 ? (
        <section
          id="popular-games"
          className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8"
        >
          <div>
            <h2 className="home-dept-title">Popular Games</h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              Choose a game, then browse Endgame, Reroll, or Top Up listings.
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            {popularGames.map((game) => (
              <GameCategoryCard
                key={game.id}
                game={game}
                accountCount={accountCounts[game.id] || 0}
                compact
              />
            ))}
          </div>
        </section>
      ) : null}

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

      <section className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <div className="border border-[var(--border)] bg-white px-4 py-5 text-center sm:px-6">
          <h2 className="text-base font-semibold tracking-tight text-[var(--foreground)] sm:text-lg">
            Find me an account
          </h2>
          <p className="mx-auto mt-1.5 max-w-lg text-sm text-[var(--muted)]">
            Tell us the game, budget, and what you need. We will open WhatsApp
            with your request — no order is created.
          </p>
          <div className="mt-4 flex justify-center">
            <FindAccountCTA
              games={games}
              variant="whatsapp"
              label="Find Me an Account"
              compact
            />
          </div>
        </div>
      </section>

      <TrustBar />
    </main>
  );
}
