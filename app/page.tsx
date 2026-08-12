import Link from "next/link";
import Navbar from "@/components/Navbar";
import ProductCard from "@/components/ProductCard";
import GameCategoryCard from "@/components/GameCategoryCard";
import HeroVisual from "@/components/HeroVisual";
import TrustBar from "@/components/TrustBar";
import { WhatsAppIcon } from "@/components/icons";
import {
  SITE_NAME,
  buildWhatsAppUrl,
  SHOPEE_STORE_URL,
} from "@/lib/config";
import {
  buildAccountCounts,
  buildGameNameMap,
  fetchActiveGames,
  fetchAvailableProducts,
} from "@/lib/catalog-server";
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
    title: "Chat with us",
    body: "Tap Buy on Shopee or Chat on WhatsApp with a ready-made message.",
  },
  {
    step: "04",
    title: "Purchase",
    body: "Complete your purchase off-site via Shopee or WhatsApp.",
  },
];

const FAQ = [
  {
    q: "How do I buy an account?",
    a: "Open an available listing and choose Buy on Shopee or Chat on WhatsApp. This website does not process payments.",
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
    <section className="mx-auto w-full max-w-7xl px-4 py-14 md:px-6 md:py-16">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h2 className="section-title">{title}</h2>
          <p className="section-subtitle">{subtitle}</p>
        </div>
        <Link
          href={viewAllHref}
          className="shrink-0 text-sm text-blue-400 transition hover:text-blue-300"
        >
          {viewAllLabel}
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
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
  const [games, products] = await Promise.all([
    fetchActiveGames(),
    fetchAvailableProducts(),
  ]);

  const accountCounts = buildAccountCounts(products);
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
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <Navbar games={games} />

      <section className="hero-premium hero-split">
        <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center gap-10 px-4 py-10 md:px-6 md:py-14 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:py-16">
          <div className="w-full max-w-xl animate-fade-up lg:max-w-lg">
            <p className="hero-badge">Baitu Games</p>

            <h1 className="hero-title mt-4">Premium Game Accounts</h1>

            <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400 md:text-base">
              Find premium game accounts at competitive prices.
            </p>

            <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500">
              Buy via Shopee or chat with us on WhatsApp.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/products" className="btn-primary">
                Browse Accounts
              </Link>
              <Link href="/#popular-games" className="btn-secondary">
                Explore Games
              </Link>
            </div>
          </div>

          {(games.length > 0 || products.length > 0) && (
            <div className="w-full max-w-md lg:max-w-xl lg:flex-shrink-0">
              <HeroVisual games={games} products={products} />
            </div>
          )}
        </div>
      </section>

      <TrustBar />

      <section id="popular-games" className="mx-auto w-full max-w-7xl px-4 py-14 md:px-6 md:py-16">
        <div>
          <h2 className="section-title">Popular games</h2>
          <p className="section-subtitle">
            Browse by title — each category shows live availability
          </p>
        </div>

        {games.length === 0 && (
          <p className="mt-8 text-slate-400">No games available.</p>
        )}

        {popularGames.length > 0 && (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
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
        title="Recommended accounts"
        subtitle="Available listings with the most complete details"
        products={recommendedProducts}
        viewAllHref="/products"
        viewAllLabel="View all"
        gameNameById={gameNameById}
      />

      <section className="border-y border-white/[0.06] bg-slate-900/25">
        <ProductSection
          title="Just added"
          subtitle="Newest available accounts in our catalogue"
          products={justAddedProducts}
          viewAllHref="/products?sort=newest"
          viewAllLabel="See newest"
          gameNameById={gameNameById}
        />
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 md:px-6 md:py-14">
        <h2 className="section-title">Why choose {SITE_NAME}</h2>
        <p className="section-subtitle">
          A straightforward way to discover and purchase game accounts
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {WHY_US.map((item) => (
            <div key={item.title} className="surface-card p-5">
              <h3 className="font-semibold text-slate-100">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-white/[0.06] bg-slate-900/20">
        <div className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-14">
          <h2 className="section-title">How to buy</h2>
          <p className="section-subtitle">Four simple steps from browse to purchase</p>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((item, index) => (
              <div key={item.step} className="relative surface-card p-5">
                {index < HOW_IT_WORKS.length - 1 && (
                  <div
                    className="absolute right-0 top-8 hidden h-px w-5 translate-x-full bg-gradient-to-r from-slate-600 to-transparent lg:block"
                    aria-hidden
                  />
                )}
                <p className="text-xs font-semibold tracking-[0.2em] text-blue-400">
                  {item.step}
                </p>
                <h3 className="mt-3 font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
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
              <summary className="cursor-pointer list-none font-medium text-slate-100">
                <span className="flex items-center justify-between gap-4">
                  {item.q}
                  <span className="text-slate-500 transition group-open:rotate-45">
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center md:px-6">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            Ready to find your next account?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
            Browse available listings or message us directly on WhatsApp.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/products" className="btn-primary">
              Browse accounts
            </Link>
            <a
              href={buildWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-whatsapp"
            >
              <WhatsAppIcon />
              WhatsApp us
            </a>
            <a
              href={SHOPEE_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
            >
              Shopee store
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
