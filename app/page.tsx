"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import GameImage from "@/components/GameImage";
import {
  SITE_NAME,
  buildWhatsAppUrl,
  SHOPEE_STORE_URL,
} from "@/lib/config";
import { toUserError } from "@/lib/errors";
import type { Game, Product } from "@/lib/types";

const WHY_US = [
  {
    title: "Verified listings",
    body: "Screenshots, pricing, and availability shown before you contact us.",
  },
  {
    title: "Clear account details",
    body: "Server, level, and listing notes help you choose with confidence.",
  },
  {
    title: "Fast response",
    body: "Message us on WhatsApp and get a quick reply on availability.",
  },
  {
    title: "Secure purchase via Shopee",
    body: "Prefer marketplace checkout? Continue on our Shopee store.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Choose an account",
    body: "Browse games and open a listing that matches what you want.",
  },
  {
    step: "02",
    title: "Contact us",
    body: "Tap Buy via WhatsApp with a pre-filled message, or open Shopee.",
  },
  {
    step: "03",
    title: "Complete your purchase",
    body: "Finish the purchase off-site and receive your account through the agreed channel.",
  },
];

const FAQ = [
  {
    q: "How do I buy an account?",
    a: "Open an available listing and choose Buy via WhatsApp or Buy via Shopee. This website does not process payments.",
  },
  {
    q: "What happens after I message on WhatsApp?",
    a: "We confirm availability and guide you through purchase and account handoff.",
  },
  {
    q: "Can I buy on Shopee instead?",
    a: "Yes. Use Buy via Shopee on any listing. Product-specific Shopee links are used when available.",
  },
  {
    q: "Why do some accounts show Sold?",
    a: "Those listings are no longer available. Browse other accounts in the same game category.",
  },
];

export default function Home() {
  const [games, setGames] = useState<Game[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [accountCounts, setAccountCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

      const products = (productsResult.data || []) as Product[];
      const counts: Record<string, number> = {};

      for (const product of products) {
        if (product.game_id) {
          counts[product.game_id] = (counts[product.game_id] || 0) + 1;
        }
      }

      setGames((gamesResult.data || []) as Game[]);
      setAccountCounts(counts);
      setFeaturedProducts(products.slice(0, 8));
      setLoading(false);
    }

    void loadData();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <Navbar games={games} />

      <section className="hero-grid relative overflow-hidden border-b border-slate-800/80">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.12),_transparent_55%)]" />
        <div className="relative mx-auto w-full max-w-7xl px-4 py-16 md:px-6 md:py-24">
          <div className="max-w-3xl">
            <p className="mb-5 inline-flex rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              Trusted game account store
            </p>

            <h1 className="text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              Find your next
              <span className="block text-blue-400">game account</span>
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300 md:text-lg">
              Premium accounts for Genshin Impact, Honkai: Star Rail, Zenless Zone
              Zero and more. Browse listings, then purchase via WhatsApp or
              Shopee.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/products"
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold shadow-sm shadow-blue-950/40 transition hover:bg-blue-500"
              >
                Browse accounts
              </Link>
              <Link
                href="/products"
                className="rounded-xl border border-slate-700 bg-slate-900/60 px-5 py-3 text-sm font-semibold transition hover:border-slate-500"
              >
                Browse games
              </Link>
              <a
                href={buildWhatsAppUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold transition hover:bg-emerald-500"
              >
                WhatsApp us
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 md:px-6 md:py-20">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Popular games</h2>
            <p className="mt-2 text-sm text-slate-400">
              Choose a title to browse available accounts
            </p>
          </div>
        </div>

        {loading && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="animate-pulse rounded-2xl border border-slate-800 bg-slate-900 p-4"
              >
                <div className="mb-4 aspect-[16/10] rounded-xl bg-slate-800" />
                <div className="h-4 rounded bg-slate-800" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {!loading && !error && games.length === 0 && (
          <p className="mt-8 text-slate-400">No games available.</p>
        )}

        {!loading && !error && games.length > 0 && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {games.map((game) => (
              <Link
                key={game.id}
                href={`/products?game=${game.slug}`}
                className="card-hover rounded-2xl border border-slate-800/90 bg-slate-900/50 p-4"
              >
                <div className="relative mb-4 aspect-[16/10] overflow-hidden rounded-xl bg-slate-800">
                  <GameImage game={game} />
                </div>
                <h3 className="font-semibold">{game.name}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {accountCounts[game.id] || 0} available
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="border-y border-slate-800/80 bg-slate-900/30">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 md:px-6">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                Featured accounts
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Listings currently available to purchase
              </p>
            </div>
            <Link
              href="/products"
              className="text-sm text-blue-400 transition hover:text-blue-300"
            >
              View all →
            </Link>
          </div>

          {!loading && featuredProducts.length === 0 ? (
            <p className="text-slate-400">No accounts available right now.</p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 md:px-6">
        <h2 className="text-2xl font-bold tracking-tight">Why {SITE_NAME}</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {WHY_US.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-slate-800/90 bg-slate-900/40 p-5"
            >
              <h3 className="font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-800/80 bg-slate-900/20">
        <div className="mx-auto max-w-7xl px-4 py-16 md:px-6">
          <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {HOW_IT_WORKS.map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border border-slate-800/90 bg-slate-950/60 p-5"
              >
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

      <section className="mx-auto w-full max-w-7xl px-4 py-16 md:px-6">
        <h2 className="text-2xl font-bold tracking-tight">FAQ</h2>
        <div className="mt-6 space-y-3">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-slate-800/90 bg-slate-900/40 px-5 py-4"
            >
              <summary className="cursor-pointer list-none font-medium">
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

      <section className="border-t border-slate-800/80">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center md:px-6">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            Ready to find your next account?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
            Browse available listings or message us directly on WhatsApp.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/products"
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold transition hover:bg-blue-500"
            >
              Browse accounts
            </Link>
            <a
              href={buildWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold transition hover:bg-emerald-500"
            >
              WhatsApp us
            </a>
            <a
              href={SHOPEE_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-orange-500/50 bg-orange-500/10 px-5 py-3 text-sm font-semibold text-orange-200 transition hover:bg-orange-500/15"
            >
              Shopee store
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
