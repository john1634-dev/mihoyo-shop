"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import {
  SITE_NAME,
  SITE_TAGLINE,
  buildWhatsAppUrl,
  SHOPEE_STORE_URL,
  WHATSAPP_DISPLAY,
} from "@/lib/config";
import { toUserError } from "@/lib/errors";
import type { Game, Product } from "@/lib/types";

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Browse",
    body: "Find an available account you like across our featured games.",
  },
  {
    step: "02",
    title: "Contact",
    body: "Message us on WhatsApp with the product details, or open our Shopee store.",
  },
  {
    step: "03",
    title: "Purchase",
    body: "Complete the purchase through WhatsApp or Shopee — your chosen channel.",
  },
];

const TRUST_POINTS = [
  {
    title: "Clear account listings",
    body: "Screenshots, price, server, and availability are shown before you contact us.",
  },
  {
    title: "Direct WhatsApp support",
    body: "Ask about stock, details, and delivery on WhatsApp with a pre-filled product message.",
  },
  {
    title: "Shopee store option",
    body: "Prefer marketplace checkout? Open our Shopee store and continue there.",
  },
  {
    title: "Manual fulfilment",
    body: "After you purchase via WhatsApp or Shopee, we hand over the account through the agreed channel.",
  },
];

const FAQ = [
  {
    q: "How do I buy an account?",
    a: "Open an available listing, then choose Buy via WhatsApp or Buy via Shopee. This website does not process card payments.",
  },
  {
    q: "What happens after I message on WhatsApp?",
    a: "We confirm availability and guide you through the purchase and account handoff on WhatsApp.",
  },
  {
    q: "Can I buy on Shopee instead?",
    a: "Yes. Use Buy via Shopee to open our store. If a listing has a specific Shopee link, that link is used.",
  },
  {
    q: "Why do some accounts say Sold Out?",
    a: "Those listings are no longer available. You can still view details, but purchase buttons are hidden.",
  },
];

export default function Home() {
  const router = useRouter();

  const [games, setGames] = useState<Game[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [hotProducts, setHotProducts] = useState<Product[]>([]);
  const [latestProducts, setLatestProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let active = true;

    async function loadData() {
      setLoading(true);
      setError("");

      const [gamesResult, productsResult] = await Promise.all([
        supabase
          .from("games")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("products")
          .select("*")
          .eq("status", "available")
          .order("created_at", { ascending: false }),
      ]);

      if (!active) return;

      if (gamesResult.error || productsResult.error) {
        setError(
          toUserError(
            gamesResult.error?.message ||
              productsResult.error?.message ||
              "Load failed"
          )
        );
        setLoading(false);
        return;
      }

      const products = productsResult.data || [];
      setGames(gamesResult.data || []);
      setFeaturedProducts(products.slice(0, 4));
      setHotProducts(
        [...products]
          .sort((a, b) => Number(b.price) - Number(a.price))
          .slice(0, 4)
      );
      setLatestProducts(products.slice(0, 8));
      setLoading(false);
    }

    void loadData();

    return () => {
      active = false;
    };
  }, []);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    router.push(query ? `/products?q=${encodeURIComponent(query)}` : "/products");
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <Navbar games={games} />

      <section className="relative overflow-hidden border-b border-slate-800">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.16),_transparent_55%)]" />
        <div className="relative mx-auto w-full max-w-7xl px-4 py-16 md:px-6 md:py-24">
          <div className="max-w-3xl">
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-blue-400">
              {SITE_NAME}
            </p>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
              Find Your Next Game Account
            </h1>
            <p className="mt-4 text-lg text-slate-300 md:text-xl">
              Browse verified game accounts and choose the one that fits you.
            </p>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-400">
              {SITE_TAGLINE}. View screenshots and details, then buy via WhatsApp
              or our Shopee store.
            </p>

            <form
              onSubmit={handleSearch}
              className="mt-8 flex max-w-xl flex-col gap-3 sm:flex-row"
              role="search"
            >
              <label className="sr-only" htmlFor="home-search">
                Search game accounts
              </label>
              <input
                id="home-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search game accounts..."
                className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900/80 px-5 py-4 outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-6 py-4 font-medium transition hover:bg-blue-500"
              >
                Search
              </button>
            </form>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/products"
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold transition hover:bg-blue-500"
              >
                Browse Accounts
              </Link>
              <a
                href={buildWhatsAppUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold transition hover:bg-emerald-500"
              >
                Chat on WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 md:px-6 md:py-20">
        <h2 className="text-2xl font-bold">Browse by Game</h2>
        <p className="mt-2 text-sm text-slate-400">
          Choose a title to browse available accounts
        </p>

        {loading && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="animate-pulse rounded-2xl border border-slate-800 bg-slate-900 p-6"
              >
                <div className="mb-5 aspect-[16/10] rounded-xl bg-slate-800" />
                <div className="h-4 rounded bg-slate-800" />
              </div>
            ))}
          </div>
        )}

        {error && <p className="mt-8 text-red-400">{error}</p>}

        {!loading && !error && games.length === 0 && (
          <p className="mt-8 text-slate-400">No games configured yet.</p>
        )}

        {!loading && !error && games.length > 0 && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {games.map((game) => (
              <Link
                key={game.id}
                href={`/products?game=${game.slug}`}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-blue-500"
              >
                <div className="relative mb-5 aspect-[16/10] overflow-hidden rounded-xl bg-slate-800">
                  {game.banner_url || game.mobile_banner_url ? (
                    <Image
                      src={(game.banner_url || game.mobile_banner_url) as string}
                      alt={game.name}
                      fill
                      sizes="(max-width: 640px) 100vw, 25vw"
                      className="object-cover"
                      loading="lazy"
                    />
                  ) : game.logo_url ? (
                    <div className="flex h-full items-center justify-center p-8">
                      <Image
                        src={game.logo_url}
                        alt={game.name}
                        width={400}
                        height={200}
                        className="max-h-full w-auto object-contain"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      {game.name}
                    </div>
                  )}
                </div>
                <h3 className="font-semibold">{game.name}</h3>
                <p className="mt-2 text-sm text-slate-400">Browse accounts →</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-16 md:px-6">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Featured Accounts</h2>
            <p className="mt-2 text-sm text-slate-400">
              Highlighted listings currently available
            </p>
          </div>
          <Link
            href="/products"
            className="shrink-0 text-sm text-blue-400 hover:text-blue-300"
          >
            View all
          </Link>
        </div>
        {!loading && featuredProducts.length === 0 ? (
          <p className="text-slate-400">No accounts available.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-16 md:px-6">
        <h2 className="text-2xl font-bold">Hot Accounts</h2>
        <p className="mt-2 text-sm text-slate-400">
          Higher-priced available listings
        </p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {hotProducts.map((product) => (
            <ProductCard key={`hot-${product.id}`} product={product} />
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-16 md:px-6">
        <h2 className="text-2xl font-bold">New Accounts</h2>
        <p className="mt-2 text-sm text-slate-400">Recently added listings</p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {latestProducts.map((product) => (
            <ProductCard key={`latest-${product.id}`} product={product} />
          ))}
        </div>
      </section>

      <section className="border-y border-slate-800 bg-slate-900/40">
        <div className="mx-auto max-w-7xl px-4 py-16 md:px-6">
          <h2 className="text-2xl font-bold">How it works</h2>
          <p className="mt-2 text-sm text-slate-400">
            Browse available game accounts, then purchase off-site
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {HOW_IT_WORKS.map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6"
              >
                <p className="text-xs font-semibold tracking-[0.2em] text-blue-400">
                  {item.step}
                </p>
                <h3 className="mt-3 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 md:px-6">
        <h2 className="text-2xl font-bold">Why buy from {SITE_NAME}</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {TRUST_POINTS.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6"
            >
              <h3 className="font-semibold text-slate-100">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-16 md:px-6">
        <h2 className="text-2xl font-bold">FAQ</h2>
        <div className="mt-8 space-y-4">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-slate-800 bg-slate-900/70 px-5 py-4"
            >
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

      <section className="border-y border-slate-800 bg-slate-900/50">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-12 md:grid-cols-2 md:px-6">
          <div className="rounded-2xl border border-emerald-900/50 bg-emerald-950/20 p-6">
            <h2 className="text-xl font-bold">Chat on WhatsApp</h2>
            <p className="mt-2 text-sm text-slate-400">
              Ask about availability and complete your purchase with us directly.
            </p>
            <a
              href={buildWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold transition hover:bg-emerald-500"
            >
              WhatsApp {WHATSAPP_DISPLAY}
            </a>
          </div>
          <div className="rounded-2xl border border-orange-900/40 bg-orange-950/20 p-6">
            <h2 className="text-xl font-bold">Shop on Shopee</h2>
            <p className="mt-2 text-sm text-slate-400">
              Prefer marketplace checkout? Visit our Shopee store.
            </p>
            <a
              href={SHOPEE_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex rounded-xl border border-orange-500/60 bg-orange-500/10 px-5 py-3 text-sm font-semibold text-orange-200 transition hover:bg-orange-500/20"
            >
              Open Shopee Store
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
