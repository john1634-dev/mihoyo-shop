"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { adminFetch } from "@/lib/admin-api";
import { formatPrice } from "@/lib/config";
import {
  formatAdminStockLine,
  inventoryManageHref,
  matchesAdminStockFilter,
  type AdminStockFilter,
  type ProductStockSummary,
} from "@/lib/inventory-stock";
import { ProductStockBadge } from "@/components/admin/ProductStockSummary";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  title: string;
  price: number;
  currency: string;
  status: string;
  server: string | null;
  ar_level: number | null;
  cover_image_url: string | null;
  cost_myr: number | null;
  game_id: string | null;
};

type Game = {
  id: string;
  name: string;
};

function productStatusClass(status: string): string {
  if (status === "available") {
    return "rounded-full bg-green-500/10 px-3 py-1 text-xs text-green-400";
  }
  if (status === "sold") {
    return "rounded-full bg-red-500/10 px-3 py-1 text-xs text-red-400";
  }
  return "rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400";
}

function ProductActions({ product }: { product: Product }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Link
        href={`/admin/products/${product.id}/edit`}
        className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium hover:border-blue-500 hover:text-blue-400 sm:min-w-[5.5rem] sm:flex-none"
      >
        Edit
      </Link>
      <Link
        href={inventoryManageHref(product.id)}
        className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium hover:border-cyan-500 hover:text-cyan-300 sm:min-w-[5.5rem] sm:flex-none"
      >
        Inventory
      </Link>
    </div>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, ProductStockSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [gameFilter, setGameFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<AdminStockFilter>("all");
  const [, startTransition] = useTransition();

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      const [productsResult, gamesResult] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id,title,price,currency,status,server,ar_level,cover_image_url,cost_myr,game_id"
          )
          .order("created_at", { ascending: false }),
        supabase.from("games").select("id,name").order("name", { ascending: true }),
      ]);

      if (!active) return;

      if (productsResult.error) {
        setError(productsResult.error.message);
        setLoading(false);
        return;
      }

      const list = (productsResult.data || []) as Product[];
      setProducts(list);
      setGames((gamesResult.data || []) as Game[]);

      try {
        const ids = list.map((p) => p.id).join(",");
        const res = await adminFetch(
          `/api/admin/inventory/stock?product_ids=${encodeURIComponent(ids)}`,
          { cache: "no-store" }
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.summaries) {
          setStockMap(data.summaries as Record<string, ProductStockSummary>);
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

      const available = stockMap[product.id]?.available_count ?? 0;
      if (!matchesAdminStockFilter(stockFilter, available)) {
        return false;
      }

      if (!query) return true;

      const gameName = gameNameById.get(product.game_id || "") || "";
      return (
        product.title.toLowerCase().includes(query) ||
        (product.server || "").toLowerCase().includes(query) ||
        product.status.toLowerCase().includes(query) ||
        gameName.toLowerCase().includes(query)
      );
    });
  }, [products, search, statusFilter, gameFilter, stockFilter, stockMap, gameNameById]);

  return (
    <div className="mx-auto min-w-0 max-w-7xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/admin" className="text-sm text-slate-400 hover:text-white">
            ← Dashboard
          </Link>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Products</h1>
          <p className="mt-1 text-sm text-slate-400">
            Listing status and sellable inventory stock are separate.
          </p>
        </div>
        <Link
          href="/admin/products/new"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-center font-medium hover:bg-blue-500"
        >
          + Add Product
        </Link>
      </div>

      <div className="mt-6 grid gap-3">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search products..."
          className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-blue-500"
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <select
            value={gameFilter}
            onChange={(event) => setGameFilter(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm"
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
            className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="available">Available</option>
            <option value="sold">Sold</option>
            <option value="hidden">Hidden</option>
          </select>
          <select
            value={stockFilter}
            onChange={(event) => setStockFilter(event.target.value as AdminStockFilter)}
            className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm sm:col-span-2 lg:col-span-1"
          >
            <option value="all">All stock</option>
            <option value="in_stock">In Stock</option>
            <option value="low_stock">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-900/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-8 animate-pulse space-y-3">
          <div className="h-28 rounded-2xl bg-slate-900" />
          <div className="h-28 rounded-2xl bg-slate-900" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center">
          <h2 className="text-lg font-semibold">
            {products.length === 0 ? "No products found" : "No matching products"}
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            {products.length === 0
              ? "Create your first product listing."
              : "Try different filters or search terms."}
          </p>
          {products.length === 0 && (
            <Link
              href="/admin/products/new"
              className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium hover:bg-blue-500"
            >
              Add Product
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="mt-8 hidden overflow-hidden rounded-2xl border border-slate-800 lg:block">
            <table className="w-full">
              <thead className="bg-slate-900">
                <tr className="border-b border-slate-800 text-left text-sm text-slate-400">
                  <th className="px-5 py-4">Product</th>
                  <th className="px-5 py-4">Game</th>
                  <th className="px-5 py-4">Price</th>
                  <th className="px-5 py-4">Stock</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => {
                  const available = stockMap[product.id]?.available_count ?? 0;
                  const gameName = gameNameById.get(product.game_id || "") || "—";

                  return (
                    <tr
                      key={product.id}
                      className="border-b border-slate-800 hover:bg-slate-900/60"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-800">
                            {product.cover_image_url ? (
                              <Image
                                src={product.cover_image_url}
                                alt={product.title}
                                fill
                                sizes="48px"
                                className="object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                                —
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{product.title}</p>
                            <p className="text-xs text-slate-500">
                              {product.server || "No server"}
                              {product.ar_level != null ? ` · AR ${product.ar_level}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-300">{gameName}</td>
                      <td className="px-5 py-4 font-semibold">
                        {formatPrice(Number(product.price), product.currency)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          <p className="text-sm">{formatAdminStockLine(available)}</p>
                          <ProductStockBadge availableCount={available} compact />
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={productStatusClass(product.status)}>
                          {product.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <ProductActions product={product} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-8 space-y-4 lg:hidden">
            {filtered.map((product) => {
              const available = stockMap[product.id]?.available_count ?? 0;
              const gameName = gameNameById.get(product.game_id || "") || "—";

              return (
                <article
                  key={product.id}
                  className="min-w-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70"
                >
                  <div className="relative aspect-[16/9] max-h-48 bg-slate-800 sm:max-h-none">
                    {product.cover_image_url ? (
                      <Image
                        src={product.cover_image_url}
                        alt={product.title}
                        fill
                        sizes="100vw"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-slate-500">
                        No cover image
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 p-4">
                    <span className="inline-flex max-w-full truncate rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
                      {gameName}
                    </span>

                    <div className="min-w-0">
                      <h2 className="line-clamp-2 break-words text-lg font-semibold">
                        {product.title}
                      </h2>
                      {(product.server || product.ar_level != null) && (
                        <p className="mt-1 line-clamp-1 text-sm text-slate-400">
                          {product.server || "No server"}
                          {product.ar_level != null ? ` · AR ${product.ar_level}` : ""}
                        </p>
                      )}
                    </div>

                    <p className="text-xl font-bold">
                      {formatPrice(Number(product.price), product.currency)}
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                      <ProductStockBadge availableCount={available} compact />
                      <span className={productStatusClass(product.status)}>
                        {product.status}
                      </span>
                    </div>

                    <ProductActions product={product} />
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
