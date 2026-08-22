"use client";

import { useEffect, useMemo, useState, useTransition, useCallback } from "react";
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
import ConfirmDialog from "@/components/admin/ConfirmDialog";
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
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
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

  const filteredIdSet = useMemo(
    () => new Set(filtered.map((product) => product.id)),
    [filtered]
  );

  const visibleSelectedIds = useMemo(
    () => [...selectedIds].filter((id) => filteredIdSet.has(id)),
    [selectedIds, filteredIdSet]
  );

  const allFilteredSelected =
    filtered.length > 0 && visibleSelectedIds.length === filtered.length;

  const someFilteredSelected =
    visibleSelectedIds.length > 0 && !allFilteredSelected;

  const toggleSelectProduct = useCallback((productId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }, []);

  const toggleSelectAllFiltered = useCallback(() => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) {
        for (const product of filtered) {
          next.delete(product.id);
        }
      } else {
        for (const product of filtered) {
          next.add(product.id);
        }
      }
      return next;
    });
  }, [allFilteredSelected, filtered]);

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

  async function confirmDeleteProduct() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setError("");

    try {
      const res = await adminFetch("/api/admin/products/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: deleteTarget.id,
          confirm: true,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.deleted) {
        setProducts((current) =>
          current.filter((product) => product.id !== deleteTarget.id)
        );
        handleFeedback(`Deleted "${deleteTarget.title}".`, "success");
        setDeleteTarget(null);
        return;
      }

      if (res.status === 409 && data.hidden) {
        setProducts((current) =>
          current.map((product) =>
            product.id === deleteTarget.id
              ? { ...product, status: "hidden" }
              : product
          )
        );
        handleFeedback(data.message || "Listing hidden due to order history.", "success");
        setDeleteTarget(null);
        return;
      }

      handleFeedback(data.message || data.error || "Delete failed.", "error");
    } catch {
      handleFeedback("Delete failed.", "error");
    } finally {
      setDeleteLoading(false);
    }
  }

  async function confirmBulkDeleteProducts() {
    if (visibleSelectedIds.length === 0) return;
    setBulkDeleteLoading(true);
    setError("");

    try {
      const res = await adminFetch("/api/admin/products/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_ids: visibleSelectedIds,
          confirm: true,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        handleFeedback(data.error || "Bulk delete failed.", "error");
        return;
      }

      const deletedIds = new Set<string>();
      const hiddenIds = new Set<string>();

      for (const result of data.results ?? []) {
        if (result.deleted) deletedIds.add(result.productId);
        if (result.hidden) hiddenIds.add(result.productId);
      }

      setProducts((current) => {
        const remaining = current.filter((product) => !deletedIds.has(product.id));
        return remaining.map((product) =>
          hiddenIds.has(product.id) ? { ...product, status: "hidden" } : product
        );
      });
      setSelectedIds(new Set());

      const parts: string[] = [];
      if ((data.deleted ?? 0) > 0) {
        parts.push(`${data.deleted} deleted`);
      }
      if ((data.hidden ?? 0) > 0) {
        parts.push(
          `${data.hidden} hidden because ${data.hidden === 1 ? "it has" : "they have"} order history`
        );
      }
      if ((data.failed ?? 0) > 0 || (data.notFound ?? 0) > 0) {
        const failedCount = (data.failed ?? 0) + (data.notFound ?? 0);
        parts.push(`${failedCount} could not be removed`);
      }

      handleFeedback(
        parts.length > 0 ? `${parts.join(", ")}.` : "Bulk delete completed.",
        parts.some((part) => part.includes("could not")) ? "error" : "success"
      );
      setBulkDeleteOpen(false);
    } catch {
      handleFeedback("Bulk delete failed.", "error");
    } finally {
      setBulkDeleteLoading(false);
    }
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
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {visibleSelectedIds.length > 0 && (
            <>
              <span className="text-sm text-slate-400">
                {visibleSelectedIds.length} selected
              </span>
              <button
                type="button"
                onClick={() => setBulkDeleteOpen(true)}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-red-900/50 px-4 py-2.5 text-sm font-medium text-red-300 hover:border-red-500 hover:text-red-200"
              >
                Delete Selected
              </button>
            </>
          )}
          <Link
            href="/admin/products/new"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium hover:bg-blue-500"
          >
            + Add Product
          </Link>
        </div>
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
                    <th className="w-10 px-3 py-2.5 font-semibold">
                      <input
                        type="checkbox"
                        aria-label="Select all products on this page"
                        checked={allFilteredSelected}
                        ref={(input) => {
                          if (input) input.indeterminate = someFilteredSelected;
                        }}
                        onChange={toggleSelectAllFiltered}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="w-[20%] px-3 py-2.5 font-semibold">Title</th>
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
                          <input
                            type="checkbox"
                            aria-label={`Select ${product.title}`}
                            checked={selectedIds.has(product.id)}
                            onChange={() => toggleSelectProduct(product.id)}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
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
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(product)}
                              className="inline-flex min-h-9 items-center rounded-md border border-red-900/50 px-2.5 py-1.5 text-xs font-medium text-red-300 hover:border-red-500 hover:text-red-200"
                            >
                              Delete
                            </button>
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
                    <input
                      type="checkbox"
                      aria-label={`Select ${product.title}`}
                      checked={selectedIds.has(product.id)}
                      onChange={() => toggleSelectProduct(product.id)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500"
                    />
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
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(product)}
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-red-900/50 px-3 py-2 text-sm font-medium text-red-300 hover:border-red-500 hover:text-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      <ConfirmDialog
        open={bulkDeleteOpen}
        title="Delete selected products?"
        description={
          visibleSelectedIds.length > 0
            ? `Delete ${visibleSelectedIds.length} selected product${visibleSelectedIds.length === 1 ? "" : "s"}? Listings with order history will be hidden instead of deleted. This cannot be undone for deletions.`
            : ""
        }
        confirmLabel="Delete Selected"
        loading={bulkDeleteLoading}
        loadingLabel="Deleting…"
        onConfirm={() => {
          void confirmBulkDeleteProducts();
        }}
        onCancel={() => {
          if (!bulkDeleteLoading) setBulkDeleteOpen(false);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete product?"
        description={
          deleteTarget
            ? `Delete "${deleteTarget.title}" permanently? Listings with order history will be hidden instead. This cannot be undone for deletions.`
            : ""
        }
        confirmLabel="Delete"
        loading={deleteLoading}
        loadingLabel="Deleting…"
        onConfirm={() => {
          void confirmDeleteProduct();
        }}
        onCancel={() => {
          if (!deleteLoading) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
