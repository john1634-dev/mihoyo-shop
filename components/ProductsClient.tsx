"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import ProductCard from "@/components/ProductCard";
import GameImage from "@/components/GameImage";
import { CloseIcon, FilterIcon } from "@/components/icons";
import { getGameImageUrl } from "@/lib/games";
import { normalizeProductSort } from "@/lib/catalog-server";
import {
  REGION_OPTIONS,
  SUPPORTED_CURRENCIES,
  getRegionLabel,
  normalizeCurrencyCode,
  normalizeRegionCode,
} from "@/lib/catalog-meta";
import type { ProductStockSummary } from "@/lib/inventory-stock";
import type { Game, Product } from "@/lib/types";

type FilterOverrides = {
  game?: string;
  q?: string;
  sort?: string;
  status?: string;
  region?: string;
  currency?: string;
  server?: string;
};

const STATUS_LABELS: Record<string, string> = {
  sold: "Sold out",
  all: "Available + Sold",
};

const SORT_LABELS: Record<string, string> = {
  "price-asc": "Price: Low to High",
  "price-desc": "Price: High to Low",
};

function buildProductListHref(
  current: {
    gameSlug: string;
    searchQuery: string;
    sort: string;
    statusFilter: string;
    regionCode: string;
    currencyCode: string;
    serverFilter: string;
  },
  overrides: FilterOverrides = {}
) {
  const params = new URLSearchParams();
  const nextGame = overrides.game ?? current.gameSlug;
  const nextQ = overrides.q ?? current.searchQuery;
  const nextSort = normalizeProductSort(overrides.sort ?? current.sort);
  const nextStatus = overrides.status ?? current.statusFilter;
  const nextRegion =
    overrides.region !== undefined
      ? normalizeRegionCode(overrides.region) || ""
      : current.regionCode;
  const nextCurrency =
    overrides.currency !== undefined
      ? overrides.currency
        ? normalizeCurrencyCode(overrides.currency, "")
        : ""
      : current.currencyCode;
  const nextServer =
    overrides.server !== undefined
      ? overrides.server.trim()
      : current.serverFilter.trim();

  if (nextGame) params.set("game", nextGame);
  if (nextQ.trim()) params.set("q", nextQ.trim());
  if (nextSort !== "newest") params.set("sort", nextSort);
  if (nextStatus !== "available") params.set("status", nextStatus);
  if (nextRegion) params.set("region", nextRegion);
  if (nextCurrency) params.set("currency", nextCurrency);
  if (nextServer) params.set("server", nextServer);

  const query = params.toString();
  return query ? `/products?${query}` : "/products";
}

type ProductFiltersProps = {
  games: Game[];
  gameSlug: string;
  searchQuery: string;
  sort: string;
  statusFilter: string;
  regionCode: string;
  currencyCode: string;
  serverFilter: string;
  buildHref: (overrides: FilterOverrides) => string;
  onNavigate: (overrides: FilterOverrides) => void;
  onClear: () => void;
};

function ProductFilters({
  games,
  gameSlug,
  searchQuery,
  sort,
  statusFilter,
  regionCode,
  currencyCode,
  serverFilter,
  buildHref,
  onNavigate,
  onClear,
}: ProductFiltersProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [localServer, setLocalServer] = useState(serverFilter);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    onNavigate({ q: localSearch, server: localServer });
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submitSearch} className="space-y-5">
        <div>
          <label
            htmlFor="product-search"
            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"
          >
            Search
          </label>
          <input
            id="product-search"
            type="search"
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
            placeholder="Search accounts..."
            className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent-strong)]"
          />
        </div>

        <div>
          <label
            htmlFor="product-server"
            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"
          >
            Server
          </label>
          <input
            id="product-server"
            type="text"
            value={localServer}
            onChange={(event) => setLocalServer(event.target.value)}
            placeholder="e.g. Asia, SEA"
            className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent-strong)]"
          />
        </div>

        <button type="submit" className="btn-primary w-full">
          Search
        </button>
      </form>

      <div>
        <label
          htmlFor="product-sort"
          className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"
        >
          Sort
        </label>
        <select
          id="product-sort"
          value={sort}
          onChange={(event) => onNavigate({ sort: event.target.value })}
          className="w-full min-h-11 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--foreground)]"
        >
          <option value="newest">Newest</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
        </select>
      </div>

      <div>
        <label
          htmlFor="product-status"
          className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"
        >
          Status
        </label>
        <select
          id="product-status"
          value={statusFilter}
          onChange={(event) => onNavigate({ status: event.target.value })}
          className="w-full min-h-11 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--foreground)]"
        >
          <option value="available">Available</option>
          <option value="sold">Sold out</option>
          <option value="all">Available + Sold</option>
        </select>
      </div>

      <div>
        <label
          htmlFor="product-region"
          className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"
        >
          Region
        </label>
        <select
          id="product-region"
          value={regionCode}
          onChange={(event) => onNavigate({ region: event.target.value })}
          className="w-full min-h-11 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--foreground)]"
        >
          <option value="">All regions</option>
          {REGION_OPTIONS.map((region) => (
            <option key={region.code} value={region.code}>
              {region.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="product-currency"
          className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"
        >
          Currency
        </label>
        <select
          id="product-currency"
          value={currencyCode}
          onChange={(event) => onNavigate({ currency: event.target.value })}
          className="w-full min-h-11 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--foreground)]"
        >
          <option value="">All currencies</option>
          {SUPPORTED_CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Game
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildHref({ game: "" })}
            className={`rounded-full px-3 py-1.5 text-xs ${
              !gameSlug
                ? "bg-[var(--accent-strong)] text-white"
                : "border border-[var(--border)] text-[var(--muted-strong)] hover:border-[var(--accent)]"
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
                  ? "bg-[var(--accent-strong)] text-white"
                  : "border border-[var(--border)] text-[var(--muted-strong)] hover:border-[var(--accent)]"
              }`}
            >
              {game.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="pt-2">
        <button type="button" onClick={onClear} className="btn-secondary w-full">
          Clear filters
        </button>
      </div>
    </div>
  );
}

type ActiveFilterChip = {
  key: string;
  label: string;
  href: string;
};

function ActiveFilters({
  chips,
  onClear,
}: {
  chips: ActiveFilterChip[];
  onClear: () => void;
}) {
  if (chips.length === 0) return null;

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
        Active:
      </span>
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-xs text-[var(--foreground)] shadow-[var(--shadow-card)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
        >
          <span className="truncate">{chip.label}</span>
          <span className="shrink-0 text-[var(--muted)]" aria-hidden>
            ×
          </span>
          <span className="sr-only">Remove {chip.label} filter</span>
        </Link>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="text-xs font-medium text-blue-400 transition hover:text-blue-300"
      >
        Clear filters
      </button>
    </div>
  );
}

export type ProductsClientProps = {
  games: Game[];
  products: Product[];
  stockSummaryByProductId?: Record<string, ProductStockSummary>;
  gameSlug: string;
  searchQuery: string;
  sort: string;
  statusFilter: string;
  regionCode: string;
  currencyCode: string;
  serverFilter: string;
};

export default function ProductsClient({
  games,
  products,
  stockSummaryByProductId,
  gameSlug,
  searchQuery,
  sort,
  statusFilter,
  regionCode,
  currencyCode,
  serverFilter,
}: ProductsClientProps) {
  const router = useRouter();
  const [filterOpen, setFilterOpen] = useState(false);

  const activeGame = games.find((game) => game.slug === gameSlug);
  const gameNameById = useMemo(
    () => new Map(games.map((game) => [game.id, game.name])),
    [games]
  );
  const normalizedSort = normalizeProductSort(sort);
  const normalizedRegion = normalizeRegionCode(regionCode) || "";
  const normalizedCurrency = currencyCode
    ? normalizeCurrencyCode(currencyCode, "")
    : "";
  const normalizedServer = serverFilter.trim();

  const filterState = {
    gameSlug,
    searchQuery,
    sort,
    statusFilter,
    regionCode: normalizedRegion,
    currencyCode: normalizedCurrency,
    serverFilter: normalizedServer,
  };

  function buildHref(overrides: FilterOverrides) {
    return buildProductListHref(filterState, overrides);
  }

  function navigateFilters(overrides: FilterOverrides) {
    router.push(buildHref(overrides));
    setFilterOpen(false);
  }

  function clearFilters() {
    router.push("/products");
    setFilterOpen(false);
  }

  const activeFilterChips: ActiveFilterChip[] = [];

  if (activeGame) {
    activeFilterChips.push({
      key: "game",
      label: activeGame.name,
      href: buildProductListHref(filterState, { game: "" }),
    });
  }

  if (searchQuery.trim()) {
    activeFilterChips.push({
      key: "q",
      label: `Search: ${searchQuery.trim()}`,
      href: buildProductListHref(filterState, { q: "" }),
    });
  }

  if (normalizedRegion) {
    activeFilterChips.push({
      key: "region",
      label: `Region: ${getRegionLabel(normalizedRegion) || normalizedRegion}`,
      href: buildProductListHref(filterState, { region: "" }),
    });
  }

  if (normalizedServer) {
    activeFilterChips.push({
      key: "server",
      label: `Server: ${normalizedServer}`,
      href: buildProductListHref(filterState, { server: "" }),
    });
  }

  if (normalizedCurrency) {
    activeFilterChips.push({
      key: "currency",
      label: `Currency: ${normalizedCurrency}`,
      href: buildProductListHref(filterState, { currency: "" }),
    });
  }

  if (statusFilter !== "available") {
    activeFilterChips.push({
      key: "status",
      label: STATUS_LABELS[statusFilter] || statusFilter,
      href: buildProductListHref(filterState, { status: "available" }),
    });
  }

  if (normalizedSort !== "newest") {
    activeFilterChips.push({
      key: "sort",
      label: SORT_LABELS[normalizedSort] || normalizedSort,
      href: buildProductListHref(filterState, { sort: "newest" }),
    });
  }

  const filterPanel = (
    <ProductFilters
      key={`${gameSlug}-${searchQuery}-${normalizedSort}-${statusFilter}-${normalizedRegion}-${normalizedCurrency}-${normalizedServer}`}
      games={games}
      gameSlug={gameSlug}
      searchQuery={searchQuery}
      sort={normalizedSort}
      statusFilter={statusFilter}
      regionCode={normalizedRegion}
      currencyCode={normalizedCurrency}
      serverFilter={normalizedServer}
      buildHref={buildHref}
      onNavigate={navigateFilters}
      onClear={clearFilters}
    />
  );

  return (
    <main className="storefront-main flex min-h-screen flex-col overflow-x-hidden">
      <Navbar games={games} />

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-6 md:py-10">
        <nav aria-label="Breadcrumb" className="text-sm text-[var(--muted)]">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href="/" className="hover:text-[var(--foreground)]">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              {activeGame ? (
                <Link href="/products" className="hover:text-[var(--foreground)]">
                  Accounts
                </Link>
              ) : (
                <span className="text-[var(--foreground)]" aria-current="page">
                  Accounts
                </span>
              )}
            </li>
            {activeGame && (
              <>
                <li aria-hidden>/</li>
                <li className="text-[var(--foreground)]" aria-current="page">
                  {activeGame.name}
                </li>
              </>
            )}
          </ol>
        </nav>

        <div className="mt-6 max-w-2xl">
          {activeGame && getGameImageUrl(activeGame) ? (
            <div className="relative mb-5 aspect-[16/10] w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]">
              <GameImage game={activeGame} variant="header" />
            </div>
          ) : null}
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            {activeGame ? `${activeGame.name} Accounts` : "Game Accounts"}
          </h1>
          <p className="mt-3 text-[var(--muted)]">
            Browse our available game accounts.
          </p>
        </div>

        <ActiveFilters chips={activeFilterChips} onClear={clearFilters} />

        <div className="mt-8 flex items-center justify-between gap-3 lg:hidden">
          <p className="text-sm text-[var(--muted)]">
            {products.length} account{products.length === 1 ? "" : "s"} found
          </p>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] px-4 py-2.5 text-sm"
            aria-expanded={filterOpen}
            aria-controls="mobile-filters"
          >
            <FilterIcon />
            Filters
          </button>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl border border-[var(--border)] bg-[var(--surface-card)]/80 p-5">
              <h2 className="mb-5 text-sm font-semibold text-[var(--foreground)]">Filters</h2>
              {filterPanel}
            </div>
          </aside>

          <div className="min-w-0">
            <p className="mb-6 hidden text-sm text-[var(--muted)] lg:block">
              {products.length} account{products.length === 1 ? "" : "s"} found
            </p>

            {products.length === 0 && (
              <div className="surface-card p-10 text-center sm:p-12">
                <h2 className="text-xl font-semibold">No accounts found</h2>
                <p className="mt-2 text-[var(--muted)]">
                  Try changing your search or filters.
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

            {products.length > 0 && (
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
            )}
          </div>
        </div>
      </div>

      {filterOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[var(--surface-muted)]/40 backdrop-blur-sm"
            aria-label="Close filters"
            onClick={() => setFilterOpen(false)}
          />
          <div
            id="mobile-filters"
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-[var(--border)] bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-card-hover)]"
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
    </main>
  );
}
