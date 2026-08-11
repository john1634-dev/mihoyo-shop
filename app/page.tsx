"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/config";
import type { Game, Product } from "@/lib/types";

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

      const { data: gamesData, error: gamesError } = await supabase
        .from("games")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!active) return;

      if (gamesError) {
        setError(gamesError.message);
        setLoading(false);
        return;
      }

      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("*")
        .eq("status", "available")
        .order("created_at", { ascending: false });

      if (!active) return;

      if (productsError) {
        setError(productsError.message);
        setLoading(false);
        return;
      }

      const products = productsData || [];

      const featured = products.slice(0, 4);

      const hot = [...products]
        .sort((a, b) => Number(b.price) - Number(a.price))
        .slice(0, 4);

      const latest = products.slice(0, 8);

      setGames(gamesData || []);
      setFeaturedProducts(featured);
      setHotProducts(hot);
      setLatestProducts(latest);
      setLoading(false);
    }

    loadData();

    return () => {
      active = false;
    };
  }, []);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = searchQuery.trim();

    if (query) {
      router.push(`/products?q=${encodeURIComponent(query)}`);
    } else {
      router.push("/products");
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <Navbar games={games} />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-800">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.18),_transparent_55%)]" />

        <div className="relative mx-auto w-full max-w-7xl px-4 py-16 md:px-6 md:py-24">
          <div className="max-w-3xl">
            <p className="mb-4 text-sm font-medium uppercase tracking-wider text-blue-400">
              Malaysia · {SITE_NAME}
            </p>

            <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
              Premium Game
              <br />
              Accounts
            </h1>

            <p className="mt-6 max-w-2xl text-lg text-slate-400">
              {SITE_TAGLINE}. Verified listings for Genshin Impact, Honkai:
              Star Rail, Zenless Zone Zero and Wuthering Waves.
            </p>

            <form
              onSubmit={handleSearch}
              className="mt-8 flex max-w-xl flex-col gap-3 sm:flex-row"
            >
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search game accounts..."
                className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900/80 px-5 py-4 outline-none focus:border-blue-500"
              />

              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-6 py-4 font-medium hover:bg-blue-500"
              >
                Search
              </button>
            </form>

            <div className="mt-6 flex flex-wrap gap-4 text-sm">
              <Link
                href="/products"
                className="text-blue-400 hover:text-blue-300"
              >
                Browse all accounts →
              </Link>

              <Link
                href="/cart"
                className="text-slate-400 hover:text-white"
              >
                View cart
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Games */}
      <section className="mx-auto w-full max-w-7xl px-4 py-16 md:px-6 md:py-20">
        <h2 className="text-2xl font-bold">Popular Games</h2>

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

        {error && (
          <p className="mt-8 text-red-400">
            Error: {error}
          </p>
        )}

        {!loading && !error && games.length === 0 && (
          <p className="mt-8 text-slate-400">
            No games configured yet.
          </p>
        )}

        {!loading && !error && games.length > 0 && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {games.map((game) => (
              <Link
                key={game.id}
                href={`/products?game=${game.slug}`}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-blue-500"
              >
                <div className="mb-5 aspect-[16/10] overflow-hidden rounded-xl bg-slate-800">
                  {game.banner_url || game.mobile_banner_url ? (
                    <picture>
                      {game.mobile_banner_url && (
                        <source
                          media="(max-width: 639px)"
                          srcSet={game.mobile_banner_url}
                        />
                      )}

                      {game.banner_url ? (
                        <Image
                          src={game.banner_url}
                          alt={game.name}
                          width={1200}
                          height={750}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <Image
                          src={game.mobile_banner_url as string}
                          alt={game.name}
                          width={1200}
                          height={750}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      )}
                    </picture>
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
                    <div className="flex h-full items-center justify-center text-4xl">
                      🎮
                    </div>
                  )}
                </div>

                <h3 className="font-semibold">
                  {game.name}
                </h3>

                <p className="mt-2 text-sm text-slate-400">
                  Browse accounts →
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Featured Accounts */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-16 md:px-6">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">
              Featured Accounts
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Highlighted listings ready to buy
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
          <p className="text-slate-400">
            No accounts available.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featuredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
              />
            ))}
          </div>
        )}
      </section>

      {/* Hot Accounts */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-16 md:px-6">
        <div className="mb-8">
          <h2 className="text-2xl font-bold">
            Hot Accounts
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Higher-value listings customers look for first
          </p>
        </div>

        {!loading && hotProducts.length === 0 ? (
          <p className="text-slate-400">
            No accounts available.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {hotProducts.map((product) => (
              <ProductCard
                key={`hot-${product.id}`}
                product={product}
              />
            ))}
          </div>
        )}
      </section>

      {/* New Accounts */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-20 md:px-6">
        <div className="mb-8">
          <h2 className="text-2xl font-bold">
            New Accounts
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Recently added listings
          </p>
        </div>

        {!loading && latestProducts.length === 0 ? (
          <p className="text-slate-400">
            No accounts available.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {latestProducts.map((product) => (
              <ProductCard
                key={`latest-${product.id}`}
                product={product}
              />
            ))}
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="border-y border-slate-800 bg-slate-900/50">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-12 md:flex-row md:items-center md:px-6">
          <div>
            <h2 className="text-2xl font-bold">
              Ready to get started?
            </h2>

            <p className="mt-2 text-slate-400">
              Browse accounts, add to cart, and checkout in minutes.
            </p>
          </div>

          <Link
            href="/products"
            className="rounded-xl bg-blue-600 px-8 py-3 font-semibold hover:bg-blue-500"
          >
            Shop Now
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}