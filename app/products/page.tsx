"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import GameImage from "@/components/GameImage";
import { ProductGridSkeleton } from "@/components/ProductCardSkeleton";
import { CloseIcon, FilterIcon } from "@/components/icons";
import { PUBLIC_PRODUCT_SELECT } from "@/lib/products-public";
import { getGameImageUrl } from "@/lib/games";
import type { Game, Product } from "@/lib/types";
import { toUserError } from "@/lib/errors";

type FilterValues = {
  q: string;
  sort: string;
  status: string;
};

type ProductFiltersProps = {
  games: Game[];
  gameSlug: string;
  searchQuery: string;
  sort: string;
  statusFilter: string;
  buildHref: (overrides: {
    game?: string;
    q?: string;
    sort?: string;
    status?: string;
  }) => string;
  onApply: (values: FilterValues) => void;
  onClear: () => void;
};

function ProductFilters({
  games,
  gameSlug,
  searchQuery,
  sort,
  statusFilter,
  buildHref,
  onApply,
  onClear,
}: ProductFiltersProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [localSort, setLocalSort] = useState(sort);
  const [localStatus, setLocalStatus] = useState(statusFilter);

  function applyFilters(event?: React.FormEvent) {
    event?.preventDefault();
    onApply({
      q: localSearch,
      sort: localSort,
      status: localStatus,
    });
  }

  return (
    <form onSubmit={applyFilters} className="space-y-5">
      <div>
        <label
          htmlFor="product-search"
          className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400"
        >
          Search
        </label>
        <input
          id="product-search"
          type="search"
          value={localSearch}
          onChange={(event) => setLocalSearch(event.target.value)}
          placeholder="Search accounts..."
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label
          htmlFor="product-sort"
          className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400"
        >
          Sort
        </label>
        <select
          id="product-sort"
          value={localSort}
          onChange={(event) => setLocalSort(event.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm"
        >
          <option value="featured">Featured</option>
          <option value="newest">Newest</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
        </select>
      </div>

      <div>
        <label
          htmlFor="product-status"
          className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400"
        >
          Status
        </label>
        <select
          id="product-status"
          value={localStatus}
          onChange={(event) => setLocalStatus(event.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm"
        >
          <option value="available">Available</option>
          <option value="sold">Sold out</option>
          <option value="all">Available + Sold</option>
        </select>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Game
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildHref({ game: "" })}
            className={`rounded-full px-3 py-1.5 text-xs ${
              !gameSlug
                ? "bg-blue-600 text-white"
                : "border border-slate-700 text-slate-300 hover:border-blue-500"
            }`}
          >
            All
          </Link>
          {games.map((game) => (
            <Link
              key={game.id}
              href={buildHref({ game: game.slug })}
              className={`rounded-full px-3 py-1.5 text-xs ${
                gameSlug === game.slug
                  ? "bg-blue-600 text-white"
                  : "border border-slate-700 text-slate-300 hover:border-blue-500"
              }`}
            >
              {game.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <button type="submit" className="btn-primary w-full">
          Apply filters
        </button>
        <button type="button" onClick={onClear} className="btn-secondary w-full">
          Clear filters
        </button>
      </div>
    </form>
  );
}

function ProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const gameSlug = searchParams.get("game") || "";
  const searchQuery = searchParams.get("q") || "";
  const sort = searchParams.get("sort") || "featured";
  const statusFilter = searchParams.get("status") || "available";

  const [games, setGames] = useState<Game[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

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

      let query = supabase.from("products").select(PUBLIC_PRODUCT_SELECT);

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
        setError("Something went wrong. Please try again.");
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
    if (nextSort !== "featured") params.set("sort", nextSort);
    if (nextStatus !== "available") params.set("status", nextStatus);

    const query = params.toString();
    return query ? `/products?${query}` : "/products";
  }

  function applyFilters(values: FilterValues) {
    router.push(
      buildHref({
        q: values.q,
        sort: values.sort,
        status: values.status,
      })
    );
    setFilterOpen(false);
  }

  function clearFilters() {
    router.push("/products");
    setFilterOpen(false);
  }

  const filterPanel = (
    <ProductFilters
      key={`${gameSlug}-${searchQuery}-${sort}-${statusFilter}`}
      games={games}
      gameSlug={gameSlug}
      searchQuery={searchQuery}
      sort={sort}
      statusFilter={statusFilter}
      buildHref={buildHref}
      onApply={applyFilters}
      onClear={clearFilters}
    />
  );

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <Navbar games={games} />

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-6 md:py-10">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href="/" className="hover:text-white">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href="/products" className="hover:text-white">
                Games
              </Link>
            </li>
            {activeGame && (
              <>
                <li aria-hidden>/</li>
                <li className="text-slate-300" aria-current="page">
                  {activeGame.name}
                </li>
              </>
            )}
          </ol>
        </nav>

        <div className="mt-6 max-w-2xl">
          {activeGame && getGameImageUrl(activeGame) ? (
            <div className="relative mb-5 aspect-[16/10] w-full max-w-sm overflow-hidden rounded-2xl border border-white/[0.06] bg-slate-900">
              <GameImage game={activeGame} variant="header" />
            </div>
          ) : null}
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            {activeGame ? `${activeGame.name} Accounts` : "Game Accounts"}
          </h1>
          <p className="mt-3 text-slate-400">
            Premium listings with clear details. Purchase via Shopee or WhatsApp.
          </p>
        </div>

        <div className="mt-8 flex items-center justify-between gap-3 lg:hidden">
          <p className="text-sm text-slate-500">
            {!loading && !error
              ? `${products.length} account${products.length === 1 ? "" : "s"} found`
              : "Loading accounts..."}
          </p>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-slate-900 px-4 py-2.5 text-sm"
            aria-expanded={filterOpen}
            aria-controls="mobile-filters"
          >
            <FilterIcon />
            Filters
          </button>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl border border-white/[0.06] bg-slate-900/40 p-5">
              <h2 className="mb-5 text-sm font-semibold text-slate-200">Filters</h2>
              {filterPanel}
            </div>
          </aside>

          <div>
            {!loading && !error && (
              <p className="mb-6 hidden text-sm text-slate-500 lg:block">
                {products.length} account{products.length === 1 ? "" : "s"} found
              </p>
            )}

            {loading && <ProductGridSkeleton />}

            {error && (
              <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-400">
                {error}
              </div>
            )}

            {!loading && !error && products.length === 0 && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center">
                <h2 className="text-xl font-semibold">No accounts found.</h2>
                <p className="mt-2 text-slate-400">
                  Try adjusting your search or filters.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <button type="button" onClick={clearFilters} className="btn-secondary">
                    Clear filters
                  </button>
                  <Link href="/products" className="btn-primary">
                    Browse all accounts
                  </Link>
                </div>
              </div>
            )}

            {!loading && !error && products.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    gameName={activeGame?.name}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {filterOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            aria-label="Close filters"
            onClick={() => setFilterOpen(false)}
          />
          <div
            id="mobile-filters"
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-white/[0.08] bg-slate-950 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            role="dialog"
            aria-modal="true"
            aria-label="Filter accounts"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Filters</h2>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08]"
                aria-label="Close filters"
              >
                <CloseIcon />
              </button>
            </div>
            {filterPanel}
          </div>
        </div>
      )}

      <Footer />
    </main>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col bg-slate-950 text-white">
          <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 md:px-6">
            <ProductGridSkeleton />
          </div>
        </main>
      }
    >
      <ProductsContent />
    </Suspense>
  );
}
