"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { adminFetch } from "@/lib/admin-api";
import { formatPrice } from "@/lib/config";
import {
  formatAdminProductStockDisplay,
  matchesAdminStockFilter,
  type AdminStockFilter,
  type ProductStockSummary,
} from "@/lib/inventory-stock";
import {
  PRODUCT_TYPES,
  getProductTypeLabel,
  isWhatsAppOnlyProductType,
  normalizeProductType,
  type ProductType,
} from "@/lib/product-type";
import ProductListingStatusControl from "@/components/admin/ProductListingStatusControl";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  title: string;
  slug?: string | null;
  price: number;
  currency: string;
  status: string;
  server: string | null;
  ar_level: number | null;
  cover_image_url: string | null;
  cost_myr: number | null;
  game_id: string | null;
  updated_at: string | null;
  product_type?: string | null;
};

type Game = {
  id: string;
  name: string;
};

function productStatusClass(status: string): string {
  if (status === "available") {
    return "inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium capitalize text-emerald-300 ring-1 ring-emerald-500/25";
  }
  if (status === "sold") {
    return "inline-flex rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium capitalize text-red-300 ring-1 ring-red-500/25";
  }
  return "inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-400";
}

function adminProductTypeClass(type: ProductType): string {
  if (type === "TOP_UP") {
    return "inline-flex rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300 ring-1 ring-cyan-500/25";
  }
  if (type === "REROLL_ACCOUNT") {
    return "inline-flex rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300 ring-1 ring-violet-500/25";
  }
  return "inline-flex rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-300 ring-1 ring-blue-500/25";
}

function adminStockLabel(
  productType: string | null | undefined,
  summary: ProductStockSummary | undefined
): string {
  if (isWhatsAppOnlyProductType(normalizeProductType(productType))) {
    return "WhatsApp only";
  }
  return formatAdminProductStockDisplay(summary);
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ProductThumbnail({
  title,
  coverImageUrl,
  size = "md",
}: {
  title: string;
  coverImageUrl: string | null;
  size?: "md" | "sm";
}) {
  const dim = size === "sm" ? "h-14 w-14" : "h-12 w-12";

  return (
    <div
      className={`relative ${dim} shrink-0 overflow-hidden rounded-lg bg-slate-800 ring-1 ring-white/5`}
    >
      {coverImageUrl ? (
        <Image
          src={coverImageUrl}
          alt={title}
          fill
          sizes={size === "sm" ? "56px" : "48px"}
          className="object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-[10px] text-slate-500">
          —
        </div>
      )}
    </div>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, ProductStockSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [gameFilter, setGameFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<AdminStockFilter>("all");
  const [, startTransition] = useTransition();

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      const [productsResultPrimary, gamesResult] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id,title,slug,price,currency,status,server,ar_level,cover_image_url,cost_myr,game_id,updated_at,product_type"
          )
          .order("updated_at", { ascending: false }),
        supabase.from("games").select("id,name").order("name", { ascending: true }),
      ]);

      let productList: Product[] | null = (productsResultPrimary.data ||
        null) as Product[] | null;
      let productError = productsResultPrimary.error;

      if (
        productError &&
        /product_type|column|schema/i.test(productError.message)
      ) {
        const fallback = await supabase
          .from("products")
          .select(
            "id,title,slug,price,currency,status,server,ar_level,cover_image_url,cost_myr,game_id,updated_at"
          )
          .order("updated_at", { ascending: false });
        productList = (fallback.data || null) as Product[] | null;
        productError = fallback.error;
      }

      if (!active) return;

      if (productError) {
        setError(productError.message);
        setLoading(false);
        return;
      }

      const gamesResultResolved = gamesResult;

      const list = (productList || []) as Product[];
      setProducts(list);
      setGames((gamesResultResolved.data || []) as Game[]);

      try {
        const ids = list.map((p) => p.id).join(",");
        if (ids) {
          const res = await adminFetch(
            `/api/admin/inventory/stock?product_ids=${encodeURIComponent(ids)}`,
            { cache: "no-store" }
          );
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.summaries) {
            setStockMap(data.summaries as Record<string, ProductStockSummary>);
          }
        }
      } catch {
        // Stock API optional if inventory tables missing — list still works.
      }

      setLoading(false);
    }

    startTransition(() => {
      void load();
    });

    return () => {
      active = false;
    };
  }, [startTransition]);

  const gameNameById = useMemo(
    () => new Map(games.map((game) => [game.id, game.name])),
    [games]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products.filter((product) => {
      if (statusFilter !== "all" && product.status !== statusFilter) {
        return false;
      }

      if (gameFilter !== "all" && product.game_id !== gameFilter) {
        return false;
      }

      if (
        typeFilter !== "all" &&
        normalizeProductType(product.product_type) !== typeFilter
      ) {
        return false;
      }

      const summary = stockMap[product.id];
      const inventoryManaged = (summary?.total_count ?? 0) > 0;
      const available = summary?.available_count ?? 0;
      const isTopUp = isWhatsAppOnlyProductType(
        normalizeProductType(product.product_type)
      );

      if (stockFilter !== "all" && !isTopUp) {
        if (!inventoryManaged) {
          if (stockFilter === "out_of_stock") return false;
          return true;
        }
        if (!matchesAdminStockFilter(stockFilter, available)) {
          return false;
        }
      }

      if (!query) return true;

      return (
        product.title.toLowerCase().includes(query) ||
        (product.slug || "").toLowerCase().includes(query)
      );
    });
  }, [products, search, statusFilter, gameFilter, typeFilter, stockFilter, stockMap]);

  function handleStatusChange(productId: string, nextStatus: string) {
    setProducts((current) =>
      current.map((product) =>
        product.id === productId
          ? {
              ...product,
              status: nextStatus,
              updated_at: new Date().toISOString(),
            }
          : product
      )
    );
  }

  function handleFeedback(message: string, type: "success" | "error") {
    setFeedback({ message, type });
    window.setTimeout(() => setFeedback(null), 4000);
  }

  return (
    <div className="mx-auto min-w-0 max-w-7xl overflow-x-hidden px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/admin" className="text-sm text-slate-400 hover:text-white">
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">Products</h1>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
            {filtered.length} listing{filtered.length === 1 ? "" : "s"} · compact management view
          </p>
        </div>
        <Link
          href="/admin/products/new"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium hover:bg-blue-500"
        >
          + Add Product
        </Link>
      </div>

      <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search products..."
          className="min-h-11 w-full min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-blue-500 lg:max-w-xs"
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:flex sm:flex-wrap">
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="min-h-11 min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm"
          >
            <option value="all">All types</option>
            {PRODUCT_TYPES.map((type) => (
              <option key={type} value={type}>
                {getProductTypeLabel(type)}
              </option>
            ))}
          </select>
          <select
            value={gameFilter}
            onChange={(event) => setGameFilter(event.target.value)}
            className="min-h-11 min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm"
          >
            <option value="all">All games</option>
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="min-h-11 min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="available">Available</option>
            <option value="sold">Sold</option>
            <option value="hidden">Hidden</option>
          </select>
          <select
            value={stockFilter}
            onChange={(event) => setStockFilter(event.target.value as AdminStockFilter)}
            className="min-h-11 min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm"
          >
            <option value="all">All stock</option>
            <option value="in_stock">In Stock</option>
            <option value="low_stock">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>
        </div>
      </div>

      {feedback && (
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            feedback.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-200"
          }`}
          role="status"
        >
          {feedback.message}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-6 animate-pulse space-y-2">
          <div className="h-12 rounded-lg bg-slate-900" />
          <div className="h-12 rounded-lg bg-slate-900" />
          <div className="h-12 rounded-lg bg-slate-900" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center">
          <h2 className="text-base font-semibold">
            {products.length === 0 ? "No products found" : "No matching products"}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {products.length === 0
              ? "Create your first product listing."
              : "Try different filters or search terms."}
          </p>
          {products.length === 0 && (
            <Link
              href="/admin/products/new"
              className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium hover:bg-blue-500"
            >
              Add Product
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="mt-5 hidden overflow-hidden rounded-xl border border-slate-800 lg:block">
            <div className="max-h-[calc(100vh-14rem)] overflow-y-auto">
              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm">
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="w-[22%] px-3 py-2.5 font-semibold">Title</th>
                    <th className="w-[13%] px-3 py-2.5 font-semibold">Type</th>
                    <th className="w-[12%] px-3 py-2.5 font-semibold">Game</th>
                    <th className="w-[10%] px-3 py-2.5 font-semibold">Price</th>
                    <th className="w-[10%] px-3 py-2.5 font-semibold">Status</th>
                    <th className="w-[13%] px-3 py-2.5 font-semibold">Stock</th>
                    <th className="w-[10%] px-3 py-2.5 font-semibold">Updated</th>
                    <th className="w-[10%] px-3 py-2.5 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product) => {
                    const summary = stockMap[product.id];
                    const gameName = gameNameById.get(product.game_id || "") || "—";
                    const productType = normalizeProductType(product.product_type);
                    const stockLabel = adminStockLabel(product.product_type, summary);

                    return (
                      <tr
                        key={product.id}
                        className="border-b border-slate-800/80 hover:bg-slate-900/50"
                      >
                        <td className="px-3 py-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <ProductThumbnail
                              title={product.title}
                              coverImageUrl={product.cover_image_url}
                            />
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-sm font-medium leading-snug">
                                {product.title}
                              </p>
                              {(product.server || product.ar_level != null) && (
                                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                                  {product.server || "—"}
                                  {product.ar_level != null ? ` · AR ${product.ar_level}` : ""}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={adminProductTypeClass(productType)}>
                            {getProductTypeLabel(productType)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-300">
                          <span className="line-clamp-2">{gameName}</span>
                        </td>
                        <td className="px-3 py-3 font-semibold tabular-nums">
                          {formatPrice(Number(product.price), product.currency)}
                        </td>
                        <td className="px-3 py-3">
                          <span className={productStatusClass(product.status)}>
                            {product.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-300">{stockLabel}</td>
                        <td className="px-3 py-3 text-xs text-slate-500">
                          {formatUpdatedAt(product.updated_at)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link
                              href={`/admin/products/${product.id}/edit`}
                              className="inline-flex min-h-9 items-center rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-medium hover:border-blue-500 hover:text-blue-300"
                            >
                              Edit
                            </Link>
                            <ProductListingStatusControl
                              productId={product.id}
                              productTitle={product.title}
                              status={product.status}
                              onStatusChange={(next) => handleStatusChange(product.id, next)}
                              onFeedback={handleFeedback}
                              compact
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-5 space-y-2 lg:hidden">
            {filtered.map((product) => {
              const summary = stockMap[product.id];
              const gameName = gameNameById.get(product.game_id || "") || "—";
              const productType = normalizeProductType(product.product_type);
              const stockLabel = adminStockLabel(product.product_type, summary);

              return (
                <article
                  key={product.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"
                >
                  <div className="flex gap-3">
                    <ProductThumbnail
                      title={product.title}
                      coverImageUrl={product.cover_image_url}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <h2 className="line-clamp-2 text-sm font-semibold leading-snug">
                        {product.title}
                      </h2>
                      <p className="mt-0.5">
                        <span className={adminProductTypeClass(productType)}>
                          {getProductTypeLabel(productType)}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">{gameName}</p>
                      <p className="mt-1 text-sm font-bold tabular-nums">
                        {formatPrice(Number(product.price), product.currency)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span>
                      Stock:{" "}
                      <span className="font-medium text-slate-200">{stockLabel}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      Status:{" "}
                      <span className={productStatusClass(product.status)}>
                        {product.status}
                      </span>
                    </span>
                    <span>Updated: {formatUpdatedAt(product.updated_at)}</span>
                  </div>

                  <div className="mt-2.5 flex gap-2">
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium hover:border-blue-500 hover:text-blue-300"
                    >
                      Edit
                    </Link>
                    <div className="flex-1">
                      <ProductListingStatusControl
                        productId={product.id}
                        productTitle={product.title}
                        status={product.status}
                        onStatusChange={(next) => handleStatusChange(product.id, next)}
                        onFeedback={handleFeedback}
                        compact
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
