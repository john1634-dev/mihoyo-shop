import Link from "next/link";
import Navbar from "@/components/Navbar";
import ProductCard from "@/components/ProductCard";
import GameCategoryCard from "@/components/GameCategoryCard";
import TrustBar from "@/components/TrustBar";
import FindAccountCTA from "@/components/FindAccountCTA";
import {
  SITE_NAME,
  SHOPEE_STORE_URL,
} from "@/lib/config";
import {
  buildAccountCounts,
  buildGameNameMap,
  fetchActiveGames,
  fetchAvailableProducts,
  fetchRecentlySoldProducts,
} from "@/lib/catalog-server";
import { fetchProductStockSummaryMap } from "@/lib/catalog-stock-server";
import {
  getJustAddedProducts,
  getRecommendedProductIds,
  getRecommendedProducts,
} from "@/lib/products-public";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

const WHY_US = [
  {
    title: "Carefully selected accounts",
    body: "Listings are prepared with screenshots, pricing, and availability before you contact us.",
  },
  {
    title: "Clear account information",
    body: "Server, level, and listing notes are shown so you can compare options quickly.",
  },
  {
    title: "Fast WhatsApp support",
    body: "Message us directly with a pre-filled enquiry and get a prompt reply.",
  },
  {
    title: "Secure card checkout",
    body: "Pay by card through Stripe on this site. Payment confirms your order — we source the account after payment.",
  },
  {
    title: "Shopee purchase option",
    body: "Prefer marketplace checkout? Continue on our Shopee store when you are ready.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Browse",
    body: "Explore games and available accounts across our catalogue.",
  },
  {
    step: "02",
    title: "Choose",
    body: "Open a listing and review screenshots, details, and pricing.",
  },
  {
    step: "03",
    title: "Pick how to buy",
    body: "Choose Buy with Card (Stripe), Buy on Shopee, or Chat on WhatsApp.",
  },
  {
    step: "04",
    title: "Pay & delivery",
    body: "For Stripe orders, payment is processed securely and we source the account after payment. We verify the account and deliver it manually — not instant.",
  },
];

const FAQ = [
  {
    q: "How do I buy an account?",
    a: "Open an available listing and choose your preferred purchase method: Buy with Card (Stripe), Buy on Shopee, or Chat on WhatsApp. Card payment is processed securely through Stripe and confirms your order for sourcing — delivery is manual after verification.",
  },
  {
    q: "Can I pay by card on this website?",
    a: "Yes. Use Buy with Card on any available listing. Stripe processes payment securely. We source and verify the account after payment, then deliver manually via WhatsApp or email.",
  },
  {
    q: "Can I buy through Shopee?",
    a: "Yes. Use Buy on Shopee on any listing. Product-specific Shopee links are used when available.",
  },
  {
    q: "Can I contact you before buying?",
    a: "Absolutely. Message us on WhatsApp to confirm availability or ask about account details.",
  },
  {
    q: "How quickly will you reply?",
    a: "We aim to respond as soon as possible during active hours. WhatsApp is the fastest channel.",
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
  stockSummaryByProductId?: Record<string, import("@/lib/inventory-stock").ProductStockSummary>;
}) {
  if (products.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-12 md:px-6 md:py-14">
      <div className="mb-8 flex items-end justify-between gap-4">
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
  const recommendedProducts = getRecommendedProducts(products);
  const recommendedIds = getRecommendedProductIds(products);
  const dedupedJustAdded = getJustAddedProducts(products, recommendedIds);
  const justAddedProducts =
    dedupedJustAdded.length > 0
      ? dedupedJustAdded
      : getJustAddedProducts(products);

  return (
    <main className="storefront-main flex min-h-screen flex-col">
      <Navbar games={games} />

      <section className="hero-premium hero-compact relative">
        <div className="hero-grid-decoration" aria-hidden />
        <div className="relative mx-auto flex w-full max-w-7xl flex-col justify-center px-4 py-12 md:px-6 md:py-16 lg:py-20">
          <p className="eyebrow">Premium Game Account Marketplace</p>

          <h1 className="hero-title mt-5 max-w-3xl">
            Premium Game Accounts
            <span className="mt-1 block text-[var(--muted-strong)]">
              Find your next game account — ready to play.
            </span>
          </h1>

          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-[var(--muted)] md:text-base">
            Genshin Impact, Honkai: Star Rail, Wuthering Waves and more.
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            New accounts added regularly
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/products" className="btn-primary min-h-12 px-6">
              Browse Accounts
            </Link>
            <FindAccountCTA games={games} variant="secondary" />
          </div>
        </div>
      </section>

      <TrustBar />

      <section
        id="popular-games"
        className="mx-auto w-full max-w-7xl px-4 py-12 md:px-6 md:py-14"
      >
        <div>
          <h2 className="section-title">Shop by game</h2>
          <p className="section-subtitle">
            Browse by title — each category shows live availability
          </p>
        </div>

        {games.length === 0 && (
          <p className="mt-8 text-[var(--muted)]">No games available.</p>
        )}

        {popularGames.length > 0 && (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
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
        subtitle="Available listings with the most complete details"
        products={recommendedProducts}
        viewAllHref="/products"
        viewAllLabel="View all"
        gameNameById={gameNameById}
        stockSummaryByProductId={stockSummaryByProductId}
      />

      <section className="storefront-section-alt border-y border-[var(--border)]">
        <ProductSection
          title="New arrivals"
          subtitle="Newest available accounts in our catalogue"
          products={justAddedProducts}
          viewAllHref="/products?sort=newest"
          viewAllLabel="See newest"
          gameNameById={gameNameById}
          stockSummaryByProductId={stockSummaryByProductId}
        />
      </section>

      {recentlySold.length > 0 ? (
        <ProductSection
          title="Recently Sold"
          subtitle="Accounts that have already found a new owner"
          products={recentlySold}
          viewAllHref="/products?status=sold"
          viewAllLabel="View sold"
          gameNameById={gameNameById}
        />
      ) : null}

      <section className="mx-auto w-full max-w-7xl px-4 py-12 md:px-6 md:py-14">
        <h2 className="section-title">Why buy from {SITE_NAME}</h2>
        <p className="section-subtitle">
          A straightforward way to discover and purchase game accounts
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {WHY_US.map((item) => (
            <div key={item.title} className="surface-card p-5">
              <h3 className="font-semibold text-[var(--foreground)]">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="storefront-section-alt border-y border-[var(--border)]">
        <div className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-14">
          <h2 className="section-title">How to buy</h2>
          <p className="section-subtitle">Four simple steps from browse to delivery</p>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((item, index) => (
              <div key={item.step} className="relative surface-card p-5">
                {index < HOW_IT_WORKS.length - 1 && (
                  <div
                    className="absolute right-0 top-8 hidden h-px w-5 translate-x-full bg-gradient-to-r from-blue-200 to-transparent lg:block"
                    aria-hidden
                  />
                )}
                <p className="text-xs font-semibold tracking-[0.2em] text-[var(--accent-strong)]">
                  {item.step}
                </p>
                <h3 className="mt-3 font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto w-full max-w-7xl px-4 pb-14 md:px-6 md:pb-16">
        <h2 className="section-title">FAQ</h2>
        <div className="mt-6 space-y-3">
          {FAQ.map((item) => (
            <details key={item.q} className="faq-item px-5 py-4">
              <summary className="cursor-pointer list-none font-medium text-[var(--foreground)]">
                <span className="flex items-center justify-between gap-4">
                  {item.q}
                  <span className="text-[var(--muted)] transition group-open:rotate-45">
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="border-t border-[var(--border)]">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center md:px-6">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            Ready to find your next account?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-[var(--muted)]">
            Browse available listings or message us directly on WhatsApp.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/products" className="btn-primary min-h-12">
              Browse accounts
            </Link>
            <FindAccountCTA games={games} variant="whatsapp" label="Find Me an Account" />
            <a
              href={SHOPEE_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary min-h-12"
            >
              Shopee store
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
