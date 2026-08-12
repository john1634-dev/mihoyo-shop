"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import GameImage from "@/components/GameImage";
import { getGameImageUrl } from "@/lib/games";
import type { Game, Product } from "@/lib/types";
import { toUserError } from "@/lib/errors";

function ProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const gameSlug = searchParams.get("game") || "";
  const searchQuery = searchParams.get("q") || "";
  const sort = searchParams.get("sort") || "newest";
  const statusFilter = searchParams.get("status") || "available";

  const [games, setGames] = useState<Game[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [localSort, setLocalSort] = useState(sort);
  const [localStatus, setLocalStatus] = useState(statusFilter);

  useEffect(() => {
    let active = true;

    async function loadData() {
      setLoading(true);
      setError("");

      const gamesResult = await supabase
        .from("games")
        .select("id,name,slug,description,image_url,logo_url,banner_url,mobile_banner_url,is_active,sort_order")
        .eq("is_active", true)
        .order("sort_order");

      if (!active) return;

      if (gamesResult.error) {
        setError(toUserError(gamesResult.error.message));
        setLoading(false);
        return;
      }

      let query = supabase
        .from("products")
        .select("id,title,slug,description,price,currency,status,server,ar_level,cover_image_url,game_id,created_at,shopee_url");

      if (gameSlug) {
        const matchedGame = (gamesResult.data || []).find(
          (game) => game.slug === gameSlug
        );

        if (matchedGame) {
          query = query.eq("game_id", matchedGame.id);
        }
      }

      if (searchQuery.trim()) {
        query = query.ilike("title", `%${searchQuery.trim()}%`);
      }

      if (statusFilter === "available") {
        query = query.eq("status", "available");
      } else if (statusFilter === "sold") {
        query = query.eq("status", "sold");
      } else {
        // Public listing never includes hidden accounts
        query = query.in("status", ["available", "sold"]);
      }

      if (sort === "price-asc") {
        query = query.order("price", { ascending: true });
      } else if (sort === "price-desc") {
        query = query.order("price", { ascending: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      const productsResult = await query;

      if (!active) return;

      if (productsResult.error) {
        setError(toUserError(productsResult.error.message));
        setLoading(false);
        return;
      }

      setGames(gamesResult.data || []);
      setProducts(productsResult.data || []);
      setLoading(false);
    }

    loadData();

    return () => {
      active = false;
    };
  }, [gameSlug, searchQuery, sort, statusFilter]);

  const activeGame = games.find((game) => game.slug === gameSlug);

  function buildHref(overrides: {
    game?: string;
    q?: string;
    sort?: string;
    status?: string;
  }) {
    const params = new URLSearchParams();
    const nextGame = overrides.game ?? gameSlug;
    const nextQ = overrides.q ?? searchQuery;
    const nextSort = overrides.sort ?? sort;
    const nextStatus = overrides.status ?? statusFilter;

    if (nextGame) params.set("game", nextGame);
    if (nextQ.trim()) params.set("q", nextQ.trim());
    if (nextSort !== "newest") params.set("sort", nextSort);
    if (nextStatus !== "available") params.set("status", nextStatus);

    const query = params.toString();
    return query ? `/products?${query}` : "/products";
  }

  function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    router.push(
      buildHref({
        q: localSearch,
        sort: localSort,
        status: localStatus,
      })
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <Navbar games={games} />

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 md:px-6">
        <div className="max-w-2xl">
          {activeGame && getGameImageUrl(activeGame) ? (
            <div className="relative mb-5 aspect-[16/10] w-full max-w-sm overflow-hidden rounded-2xl border border-white/[0.06] bg-slate-900">
              <GameImage game={activeGame} variant="header" />
            </div>
          ) : null}
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            {activeGame ? `${activeGame.name} Accounts` : "All Game Accounts"}
          </h1>
          <p className="mt-3 text-slate-400">
            Premium listings with clear details. Contact us on WhatsApp or
            Shopee to purchase.
          </p>
        </div>

        <form
          onSubmit={applyFilters}
          className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]"
        >
          <input
            type="search"
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
            placeholder="Search accounts..."
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 outline-none focus:border-blue-500 sm:col-span-2 lg:col-span-1"
          />

          <select
            value={localSort}
            onChange={(event) => setLocalSort(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
          >
            <option value="newest">Newest</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>

          <select
            value={localStatus}
            onChange={(event) => setLocalStatus(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
          >
            <option value="available">Available</option>
            <option value="sold">Sold Out</option>
            <option value="all">Available + Sold</option>
          </select>

          <button
            type="submit"
            className="w-full rounded-xl bg-blue-600 px-6 py-3 font-medium hover:bg-blue-500"
          >
            Apply
          </button>
        </form>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href={buildHref({ game: "" })}
            className={`rounded-full px-4 py-2 text-sm ${
              !gameSlug
                ? "bg-blue-600 text-white"
                : "border border-slate-700 text-slate-300 hover:border-blue-500"
            }`}
          >
            All
          </Link>
          {games.map((game) => {
            const gameImage = getGameImageUrl(game);

            return (
              <Link
                key={game.id}
                href={buildHref({ game: game.slug })}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm ${
                  gameSlug === game.slug
                    ? "bg-blue-600 text-white"
                    : "border border-slate-700 text-slate-300 hover:border-blue-500"
                }`}
              >
                {gameImage ? (
                  <span className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full border border-slate-700">
                    <GameImage game={game} variant="avatar" />
                  </span>
                ) : null}
                <span>{game.name}</span>
              </Link>
            );
          })}
        </div>

        {!loading && !error && (
          <p className="mt-6 text-sm text-slate-500">
            {products.length} account{products.length === 1 ? "" : "s"} found
          </p>
        )}

        {loading && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="animate-pulse rounded-2xl border border-slate-800 bg-slate-900"
              >
                <div className="aspect-[4/3] bg-slate-800" />
                <div className="space-y-3 p-5">
                  <div className="h-4 rounded bg-slate-800" />
                  <div className="h-4 w-2/3 rounded bg-slate-800" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-8 rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && products.length === 0 && (
          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center">
            <h2 className="text-xl font-semibold">No accounts found</h2>
            <p className="mt-2 text-slate-400">
              Try a different search, status, or browse all games.
            </p>
            <Link
              href="/products"
              className="mt-6 inline-block rounded-xl bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-500"
            >
              Reset filters
            </Link>
          </div>
        )}

        {!loading && !error && products.length > 0 && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 p-10 text-white">
          Loading products...
        </main>
      }
    >
      <ProductsContent />
    </Suspense>
  );
}
