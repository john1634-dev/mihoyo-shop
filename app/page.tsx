"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import GameCategoryCard from "@/components/GameCategoryCard";
import { WhatsAppIcon } from "@/components/icons";
import {
  SITE_NAME,
  buildWhatsAppUrl,
  SHOPEE_STORE_URL,
} from "@/lib/config";
import { toUserError } from "@/lib/errors";
import type { Game, Product } from "@/lib/types";

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
    body: "Tap Buy via WhatsApp with a ready-made message, or ask questions first.",
  },
  {
    step: "04",
    title: "Purchase",
    body: "Complete your purchase off-site via WhatsApp or Shopee.",
  },
];

const TRUST = [
  "Clear account information before you buy",
  "Direct WhatsApp support",
  "Shopee purchase option",
  "Secure off-site communication",
];

const FAQ = [
  {
    q: "How do I buy an account?",
    a: "Open an available listing and choose Buy via WhatsApp or Buy on Shopee. This website does not process payments.",
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

export default function Home() {
  const [games, setGames] = useState<Game[]>([]);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);
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
          .select("id,name,slug,description,image_url,logo_url,banner_url,mobile_banner_url,is_active,sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("products")
          .select("id,title,slug,description,price,currency,status,server,ar_level,cover_image_url,game_id,created_at")
          .eq("status", "available")
          .order("created_at", { ascending: false }),
      ]);

      if (!active) return;

      if (gamesResult.error || productsResult.error) {
        const productsError = Boolean(productsResult.error);
        setError(
          productsError
            ? "Something went wrong. Please try again."
            : toUserError(gamesResult.error?.message || "Load failed")
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
      setAvailableProducts(products.slice(0, 8));
      setRecentProducts(products.slice(0, 8));
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

      <section className="hero-premium hero-grid">
        <div className="relative mx-auto w-full max-w-7xl px-4 py-14 md:px-6 md:py-20">
          <div className="max-w-3xl animate-fade-up">
            <p className="eyebrow">Premium game accounts</p>

            <h1 className="mt-5 text-3xl font-bold leading-[1.04] tracking-tight md:text-5xl lg:text-6xl">
              Find your next
              <span className="mt-1 block bg-gradient-to-r from-blue-300 via-blue-400 to-indigo-300 bg-clip-text text-transparent">
                game account
              </span>
            </h1>

            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-300 md:text-base">
              Premium game accounts, carefully selected and ready to play.
              Browse listings, then purchase via WhatsApp or Shopee.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
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
                Chat on WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="popular-games" className="mx-auto w-full max-w-7xl px-4 py-14 md:px-6 md:py-18">
        <div>
          <h2 className="section-title">Popular games</h2>
          <p className="section-subtitle">
            Browse by title — each category shows live availability
          </p>
        </div>

        {loading && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="animate-pulse rounded-2xl border border-white/[0.06] bg-slate-900"
              >
                <div className="aspect-[16/10] bg-slate-800" />
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
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
            {games.map((game) => (
              <GameCategoryCard
                key={game.id}
                game={game}
                accountCount={accountCounts[game.id] || 0}
              />
            ))}
          </div>
        )}
      </section>

      <section className="border-y border-white/[0.06] bg-slate-900/25">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 md:px-6 md:py-16">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <h2 className="section-title">Available accounts</h2>
              <p className="section-subtitle">
                {loading
                  ? "Loading available listings..."
                  : `${availableProducts.length} account${
                      availableProducts.length === 1 ? "" : "s"
                    } available now`}
              </p>
            </div>
            <Link
              href="/products"
              className="text-sm text-blue-400 transition hover:text-blue-300"
            >
              View all
            </Link>
          </div>

          {!loading && availableProducts.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-6 py-10 text-center">
              <p className="text-base font-medium text-slate-200">
                No accounts available right now
              </p>
              <p className="mt-2 text-sm text-slate-400">
                New listings are added frequently. Check back soon or message us on WhatsApp.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
              {availableProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 md:px-6 md:py-16">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="section-title">Just added</h2>
            <p className="section-subtitle">Recently listed available accounts</p>
          </div>
          <Link
            href="/products?sort=newest"
            className="text-sm text-blue-400 transition hover:text-blue-300"
          >
            See newest
          </Link>
        </div>
        {recentProducts.length === 0 && !loading ? (
          <p className="text-sm text-slate-400">No recent listings yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
            {recentProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 md:px-6 md:py-14">
        <h2 className="section-title">Why buyers choose {SITE_NAME}</h2>
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
          <h2 className="section-title">How it works</h2>
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

      <section className="mx-auto w-full max-w-7xl px-4 py-12 md:px-6 md:py-14">
        <div className="glass-panel p-6 md:p-8">
          <h2 className="section-title">Buy with confidence</h2>
          <p className="section-subtitle">
            Transparent listings and direct support — no website checkout required
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {TRUST.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm text-slate-300"
              >
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400"
                  aria-hidden
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-14 md:px-6 md:pb-16">
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

      <Footer />
    </main>
  );
}
