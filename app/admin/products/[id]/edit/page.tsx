"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ProductStockSummaryPanel } from "@/components/admin/ProductStockSummary";
import ProductListingStatusControl from "@/components/admin/ProductListingStatusControl";
import { adminFetch } from "@/lib/admin-api";
import { inventoryManageHref, type ProductStockSummary } from "@/lib/inventory-stock";
import { supabase } from "@/lib/supabase";
import ImageUploader from "@/components/ImageUploader";
import {
  computeCostMyr,
  computeProfit,
  formatMyr,
  formatRate,
  formatVnd,
  formatVndInput,
  MAX_COST_VND,
  parseVndInput,
} from "@/lib/costing";
import {
  ADMIN_CREATABLE_PRODUCT_TYPES,
  getProductTypeLabel,
  isAdminCreatableProductType,
  isWhatsAppOnlyProductType,
  normalizeProductType,
  type AdminCreatableProductType,
} from "@/lib/product-type";
import {
  REGION_OPTIONS,
  SUPPORTED_CURRENCIES,
  normalizeCurrencyCode,
  normalizeRegionCode,
} from "@/lib/catalog-meta";

type Game = {
  id: string;
  name: string;
};

type ProductImage = {
  id: string;
  image_url: string;
  image_path: string;
  sort_order: number;
};

type NewImage = {
  url: string;
  path: string;
};

type ExchangeRateResponse = {
  success: boolean;
  rate?: number;
  updatedAt?: string;
  source?: string;
  error?: string;
};

type RateState = {
  rate: number | null;
  updatedAt: string | null;
  source: string | null;
};

type StoredCostState = {
  costVnd: number | null;
  costMyr: number | null;
  rate: number | null;
  updatedAt: string | null;
};

function productStatusBadgeClass(value: string): string {
  if (value === "available") {
    return "inline-flex rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium capitalize text-emerald-300 ring-1 ring-emerald-500/25";
  }
  if (value === "sold") {
    return "inline-flex rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium capitalize text-red-300 ring-1 ring-red-500/25";
  }
  return "inline-flex rounded-full bg-slate-800 px-2.5 py-1 text-xs font-medium capitalize text-slate-400";
}

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;

  const [games, setGames] = useState<Game[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [newImages, setNewImages] = useState<NewImage[]>([]);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [gameId, setGameId] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("MYR");
  const [server, setServer] = useState("");
  const [regionCode, setRegionCode] = useState("");
  const [arLevel, setArLevel] = useState("");
  const [description, setDescription] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [shopeeUrl, setShopeeUrl] = useState("");
  const [status, setStatus] = useState("available");
  const [productType, setProductType] =
    useState<AdminCreatableProductType>("ENDGAME_ACCOUNT");

  const [costVndInput, setCostVndInput] = useState("");
  const [storedCost, setStoredCost] = useState<StoredCostState>({
    costVnd: null,
    costMyr: null,
    rate: null,
    updatedAt: null,
  });
  const [rateState, setRateState] = useState<RateState>({
    rate: null,
    updatedAt: null,
    source: null,
  });
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [statusFeedback, setStatusFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [stockSummary, setStockSummary] = useState<ProductStockSummary | null>(null);
  const [stockLoading, setStockLoading] = useState(true);

  const loadStockSummary = useCallback(async () => {
    setStockLoading(true);
    try {
      const res = await adminFetch(
        `/api/admin/inventory/stock?product_id=${encodeURIComponent(productId)}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.summary) {
        setStockSummary(data.summary as ProductStockSummary);
      }
    } catch {
      setStockSummary(null);
    } finally {
      setStockLoading(false);
    }
  }, [productId]);

  const costVnd = useMemo(() => parseVndInput(costVndInput), [costVndInput]);
  const originalCostVnd = storedCost.costVnd;
  const costChanged = costVnd !== originalCostVnd;

  const liveCostMyr =
    costChanged && costVnd !== null && rateState.rate !== null
      ? computeCostMyr(costVnd, rateState.rate)
      : storedCost.costMyr;

  const sellingPrice = Number(price);
  const safeSellingPrice = Number.isFinite(sellingPrice) ? sellingPrice : 0;
  const profitMetrics =
    liveCostMyr !== null && safeSellingPrice > 0
      ? computeProfit(safeSellingPrice, liveCostMyr)
      : null;

  async function fetchRate(force = false) {
    setRateLoading(true);
    setRateError("");
    try {
      const response = await fetch(
        `/api/exchange-rate/vnd-myr${force ? "?force=1" : ""}`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as ExchangeRateResponse;

      if (!response.ok || !data.success || !data.rate || data.rate <= 0) {
        throw new Error(data.error || "Could not fetch exchange rate.");
      }

      setRateState({
        rate: data.rate,
        updatedAt: data.updatedAt || new Date().toISOString(),
        source: data.source || null,
      });
    } catch (err) {
      setRateError(
        err instanceof Error ? err.message : "Could not update exchange rate."
      );
    } finally {
      setRateLoading(false);
    }
  }

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError("");

      let productResult = await supabase
        .from("products")
        .select(
          "id,title,slug,game_id,price,currency,server,region_code,ar_level,description,supplier_name,shopee_url,status,product_type,cost_vnd,cost_myr,vnd_myr_rate,cost_rate_updated_at"
        )
        .eq("id", productId)
        .single();

      if (
        productResult.error &&
        /product_type/i.test(productResult.error.message)
      ) {
        productResult = await supabase
          .from("products")
          .select(
            "id,title,slug,game_id,price,currency,server,region_code,ar_level,description,supplier_name,shopee_url,status,cost_vnd,cost_myr,vnd_myr_rate,cost_rate_updated_at"
          )
          .eq("id", productId)
          .single();
      }

      if (
        productResult.error &&
        /region_code/i.test(productResult.error.message)
      ) {
        productResult = await supabase
          .from("products")
          .select(
            "id,title,slug,game_id,price,currency,server,ar_level,description,supplier_name,shopee_url,status,cost_vnd,cost_myr,vnd_myr_rate,cost_rate_updated_at"
          )
          .eq("id", productId)
          .single();
      }

      const gamesResult = await supabase
        .from("games")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order");

      const imagesResult = await supabase
        .from("product_images")
        .select("*")
        .eq("product_id", productId)
        .order("sort_order");

      if (productResult.error || gamesResult.error || imagesResult.error) {
        setError(
          productResult.error?.message ||
            gamesResult.error?.message ||
            imagesResult.error?.message ||
            "Failed to load product."
        );
        setLoading(false);
        return;
      }

      const product = productResult.data;
      setGames(gamesResult.data || []);
      setImages(imagesResult.data || []);
      setTitle(product.title || "");
      setSlug(product.slug || "");
      setGameId(product.game_id || "");
      setPrice(product.price !== null ? String(product.price) : "");
      setCurrency(normalizeCurrencyCode(product.currency));
      setServer(product.server || "");
      setRegionCode(
        normalizeRegionCode(
          (product as { region_code?: string | null }).region_code
        ) || ""
      );
      setArLevel(product.ar_level !== null ? String(product.ar_level) : "");
      setDescription(product.description || "");
      setSupplierName(product.supplier_name || "");
      setShopeeUrl(product.shopee_url || "");
      setStatus(product.status || "available");
      const loadedType = normalizeProductType(
        (product as { product_type?: string }).product_type
      );
      setProductType(
        isAdminCreatableProductType(loadedType) ? loadedType : "ENDGAME_ACCOUNT"
      );

      const loadedCostVnd =
        product.cost_vnd === null || product.cost_vnd === undefined
          ? null
          : Number(product.cost_vnd);
      setCostVndInput(loadedCostVnd !== null ? formatVndInput(String(loadedCostVnd)) : "");
      setStoredCost({
        costVnd: loadedCostVnd,
        costMyr:
          product.cost_myr === null || product.cost_myr === undefined
            ? null
            : Number(product.cost_myr),
        rate:
          product.vnd_myr_rate === null || product.vnd_myr_rate === undefined
            ? null
            : Number(product.vnd_myr_rate),
        updatedAt: product.cost_rate_updated_at || null,
      });

      setLoading(false);
      if (isWhatsAppOnlyProductType(loadedType)) {
        setStockSummary(null);
        setStockLoading(false);
      } else {
        void loadStockSummary();
      }
    }

    void loadData();
    const timer = window.setTimeout(() => {
      void fetchRate(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [productId, loadStockSummary]);

  function handleCostInput(value: string) {
    setCostVndInput(formatVndInput(value));
  }

  async function saveChanges(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    if (costVndInput && costVnd === null) {
      setError(`Purchase cost must be between 1 and ${MAX_COST_VND} VND.`);
      setSaving(false);
      return;
    }

    if (costChanged && costVnd !== null && (!rateState.rate || rateState.rate <= 0)) {
      setError("Unable to fetch current exchange rate. Please refresh rate.");
      setSaving(false);
      return;
    }

    const updatePayload: Record<string, unknown> = {
      title: title.trim(),
      slug: slug.trim(),
      game_id: gameId || null,
      price: Number(price),
      currency: normalizeCurrencyCode(currency),
      server: server || null,
      region_code: normalizeRegionCode(regionCode),
      ar_level: arLevel ? Number(arLevel) : null,
      description: description || null,
      supplier_name: supplierName || null,
      shopee_url: shopeeUrl.trim() || null,
      status,
      product_type: productType,
      updated_at: new Date().toISOString(),
    };

    if (!costVndInput) {
      updatePayload.cost_vnd = null;
      updatePayload.cost_myr = null;
      updatePayload.vnd_myr_rate = null;
      updatePayload.cost_currency = null;
      updatePayload.cost_rate_updated_at = null;
    } else if (costChanged && costVnd !== null && rateState.rate !== null) {
      updatePayload.cost_vnd = costVnd;
      updatePayload.cost_myr = computeCostMyr(costVnd, rateState.rate);
      updatePayload.vnd_myr_rate = rateState.rate;
      updatePayload.cost_currency = "VND";
      updatePayload.cost_rate_updated_at = new Date().toISOString();
    }

    let productUpdate = await supabase
      .from("products")
      .update(updatePayload)
      .eq("id", productId);

    if (
      productUpdate.error &&
      /product_type|column|schema/i.test(productUpdate.error.message)
    ) {
      const { product_type: _removed, ...fallbackPayload } = updatePayload;
      void _removed;
      productUpdate = await supabase
        .from("products")
        .update(fallbackPayload)
        .eq("id", productId);
    }

    if (productUpdate.error) {
      setError(productUpdate.error.message);
      setSaving(false);
      return;
    }

    if (newImages.length > 0) {
      const startingOrder = images.length;
      const rows = newImages.map((image, index) => ({
        product_id: productId,
        image_url: image.url,
        image_path: image.path,
        sort_order: startingOrder + index,
      }));
      const insertResult = await supabase.from("product_images").insert(rows);
      if (insertResult.error) {
        setError(
          "Product saved, but images failed to save: " + insertResult.error.message
        );
        setSaving(false);
        return;
      }
    }

    const allImageUrls = [...images.map((image) => image.image_url), ...newImages.map((image) => image.url)];
    const coverImage = allImageUrls.length > 0 ? allImageUrls[0] : null;
    const coverResult = await supabase
      .from("products")
      .update({ cover_image_url: coverImage })
      .eq("id", productId);

    if (coverResult.error) {
      setError("Product saved, but cover image failed to update: " + coverResult.error.message);
      setSaving(false);
      return;
    }

    setSuccess("Product updated successfully.");
    setTimeout(() => {
      router.push("/admin/products");
      router.refresh();
    }, 800);
    setSaving(false);
  }

  async function moveImage(imageId: string, direction: "left" | "right") {
    const index = images.findIndex((image) => image.id === imageId);
    if (index < 0) return;
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;

    const reordered = [...images];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    const withOrder = reordered.map((image, order) => ({ ...image, sort_order: order }));
    setImages(withOrder);

    const updates = withOrder.map((image) =>
      supabase.from("product_images").update({ sort_order: image.sort_order }).eq("id", image.id)
    );
    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      setError(failed.error.message);
      return;
    }

    const coverResult = await supabase
      .from("products")
      .update({ cover_image_url: withOrder[0]?.image_url || null })
      .eq("id", productId);
    if (coverResult.error) setError(coverResult.error.message);
  }

  async function deleteImage(image: ProductImage) {
    const confirmed = window.confirm("Delete this image?");
    if (!confirmed) return;

    setError("");
    const storageResult = await supabase.storage.from("product-images").remove([image.image_path]);
    if (storageResult.error) {
      setError(storageResult.error.message);
      return;
    }

    const databaseResult = await supabase.from("product_images").delete().eq("id", image.id);
    if (databaseResult.error) {
      setError(databaseResult.error.message);
      return;
    }

    const updatedImages = images
      .filter((item) => item.id !== image.id)
      .map((item, index) => ({ ...item, sort_order: index }));
    setImages(updatedImages);

    const newCover = updatedImages.length > 0 ? updatedImages[0].image_url : null;
    const coverResult = await supabase
      .from("products")
      .update({ cover_image_url: newCover })
      .eq("id", productId);
    if (coverResult.error) setError(coverResult.error.message);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="animate-pulse space-y-3">
          <div className="h-8 w-48 rounded bg-slate-900" />
          <div className="h-64 rounded-2xl bg-slate-900" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-w-0 max-w-5xl overflow-x-hidden px-4 py-6 text-white sm:px-6 sm:py-8">
        <Link href="/admin/products" className="text-sm text-slate-400 hover:text-white">
          ← Back to Products
        </Link>

        <header className="mt-5 rounded-xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="line-clamp-2 text-xl font-bold sm:text-2xl">
                {title || "Edit Product"}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={productStatusBadgeClass(status)}>{status}</span>
              </div>
              {stockSummary &&
                !stockLoading &&
                !isWhatsAppOnlyProductType(productType) && (
                <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                  <div>
                    <span className="text-slate-500">Stock: </span>
                    <span className="font-medium text-slate-200">
                      {stockSummary.available_count} available
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Assigned: </span>
                    <span className="font-medium text-slate-200">
                      {stockSummary.assigned_count}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Total: </span>
                    <span className="font-medium text-slate-200">
                      {stockSummary.total_count}
                    </span>
                  </div>
                </dl>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!isWhatsAppOnlyProductType(productType) ? (
                <Link
                  href={inventoryManageHref(productId)}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium hover:border-cyan-500 hover:text-cyan-300"
                >
                  Manage Inventory
                </Link>
              ) : null}
              <ProductListingStatusControl
                productId={productId}
                productTitle={title || "Product"}
                status={status}
                onStatusChange={setStatus}
                onFeedback={(message, type) => {
                  setStatusFeedback({ message, type });
                  window.setTimeout(() => setStatusFeedback(null), 4000);
                }}
              />
            </div>
          </div>
          {statusFeedback && (
            <p
              className={`mt-3 text-sm ${
                statusFeedback.type === "success" ? "text-emerald-300" : "text-red-300"
              }`}
              role="status"
            >
              {statusFeedback.message}
            </p>
          )}
        </header>

        <form onSubmit={saveChanges} className="mt-6 space-y-5 pb-28 lg:space-y-6 lg:pb-0">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
            <h2 className="text-base font-semibold sm:text-lg">Basic Information</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-slate-300">Game</label>
                <select
                  value={gameId}
                  onChange={(event) => setGameId(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                >
                  <option value="">Select a game</option>
                  {games.map((game) => (
                    <option key={game.id} value={game.id}>
                      {game.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-slate-300">Product Type</label>
                <select
                  value={productType}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (isAdminCreatableProductType(next)) {
                      setProductType(next);
                    }
                  }}
                  className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                >
                  {ADMIN_CREATABLE_PRODUCT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {getProductTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Product Name</label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Slug</label>
                <input
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  required
                  className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Server</label>
                <input
                  value={server}
                  onChange={(event) => setServer(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Region</label>
                <select
                  value={regionCode}
                  onChange={(event) => setRegionCode(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                >
                  <option value="">Not set</option>
                  {REGION_OPTIONS.map((region) => (
                    <option key={region.code} value={region.code}>
                      {region.label} ({region.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-slate-300">AR / Level</label>
                <input
                  type="number"
                  value={arLevel}
                  onChange={(event) => setArLevel(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 md:max-w-xs"
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
            <h2 className="text-base font-semibold sm:text-lg">Pricing</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-slate-300">Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  required
                  className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Currency</label>
                <select
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                >
                  {SUPPORTED_CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
            <h2 className="text-base font-semibold sm:text-lg">Listing Status</h2>
            <div className="mt-4">
              <label className="mb-2 block text-sm text-slate-300">Listing Status</label>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
              >
                <option value="available">Available (published)</option>
                <option value="sold">Sold</option>
                <option value="hidden">Hidden</option>
              </select>
              <p className="mt-2 text-xs text-slate-500">
                Listing status is separate from inventory stock counts.
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
            <h2 className="text-base font-semibold sm:text-lg">Description</h2>
            <div className="mt-4">
              <label className="mb-2 block text-sm text-slate-300">Product Description</label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={8}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
              />
            </div>
          </section>

          <section className="rounded-2xl border border-amber-900/40 bg-slate-900 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Purchase Cost</h2>
                <p className="mt-1 text-sm text-amber-400">
                  Historical MYR cost remains unchanged unless you edit VND cost.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void fetchRate(true)}
                disabled={rateLoading}
                className="min-h-11 rounded-lg border border-slate-700 px-4 py-2 text-sm hover:border-blue-500 disabled:opacity-50"
              >
                {rateLoading ? "Fetching latest rate..." : "Refresh Rate"}
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto]">
              <div>
                <label className="mb-2 block text-sm text-slate-300">Purchase Cost</label>
                <input
                  value={costVndInput}
                  onChange={(event) => handleCostInput(event.target.value)}
                  placeholder="1,000,000"
                  inputMode="numeric"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </div>
              <div className="self-end rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300">
                VND
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Historical Cost</p>
              <p className="mt-1 text-lg font-semibold">
                {storedCost.costMyr !== null ? formatMyr(storedCost.costMyr) : "—"}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Rate used: {storedCost.rate !== null ? formatRate(storedCost.rate) : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {storedCost.updatedAt
                  ? `Saved ${new Date(storedCost.updatedAt).toLocaleString("en-MY")}`
                  : "No historical timestamp"}
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Current Exchange Rate</p>
              <p className="mt-2 text-sm text-slate-300">
                {rateState.rate ? `1 VND = RM ${formatRate(rateState.rate)}` : "Rate unavailable"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {rateState.updatedAt
                  ? `Updated ${new Date(rateState.updatedAt).toLocaleString("en-MY")}`
                  : "No rate update yet"}
                {rateState.source ? ` · ${rateState.source}` : ""}
              </p>
              {rateError && <p className="mt-2 text-xs text-red-400">{rateError}</p>}
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Effective Cost</p>
              <p className="mt-1 text-lg font-semibold">
                {liveCostMyr !== null ? formatMyr(liveCostMyr) : "—"}
              </p>
              {costChanged && costVnd !== null && (
                <p className="mt-1 text-xs text-blue-400">
                  Recalculated from {formatVnd(costVnd)} using latest rate.
                </p>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Profit Overview</p>
              {profitMetrics ? (
                <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                  <p>Purchase Cost: {formatMyr(liveCostMyr ?? 0)}</p>
                  <p>Selling Price: {formatMyr(safeSellingPrice)}</p>
                  <p className={profitMetrics.profit >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {profitMetrics.profit >= 0 ? "Estimated Profit" : "Loss"}:{" "}
                    {formatMyr(profitMetrics.profit)}
                  </p>
                  <p>Margin: {profitMetrics.margin.toFixed(2)}%</p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Profit unavailable</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-amber-900/40 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Internal Supplier Information</h2>
            <p className="mt-1 text-sm text-amber-400">
              Customers cannot see this information.
            </p>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-slate-300">Supplier Name</label>
                <input
                  value={supplierName}
                  onChange={(event) => setSupplierName(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </div>
            </div>
            <div className="mt-5">
              <label className="mb-2 block text-sm text-slate-300">
                Shopee Product URL (optional)
              </label>
              <input
                type="url"
                value={shopeeUrl}
                onChange={(event) => setShopeeUrl(event.target.value)}
                placeholder="https://shopee.com.my/..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
            <h2 className="text-lg font-semibold sm:text-xl">Product Images</h2>
            <p className="mt-1 text-sm text-slate-400">The first image is the cover image.</p>
            {images.length > 0 && (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {images.map((image, index) => (
                  <div key={image.id} className="relative min-w-0 overflow-hidden rounded-xl border border-slate-800">
                    <div className="relative aspect-square w-full">
                      <Image
                        src={image.image_url}
                        alt={`Product image ${index + 1}`}
                        fill
                        sizes="(max-width: 640px) 50vw, 25vw"
                        className="object-cover"
                      />
                    </div>
                    {index === 0 && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-3 py-2 text-xs">
                        Cover Image
                      </div>
                    )}
                    <button
                      type="button"
                      aria-label={`Delete image ${index + 1}`}
                      onClick={() => void deleteImage(image)}
                      className="absolute right-2 top-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-black/70 px-3 text-xs hover:bg-red-600"
                    >
                      Delete
                    </button>
                    <div className="absolute left-2 top-2 flex gap-1">
                      <button
                        type="button"
                        aria-label="Move image left"
                        onClick={() => void moveImage(image.id, "left")}
                        disabled={index === 0}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-black/70 text-xs disabled:opacity-30"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        aria-label="Move image right"
                        onClick={() => void moveImage(image.id, "right")}
                        disabled={index === images.length - 1}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-black/70 text-xs disabled:opacity-30"
                      >
                        →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {newImages.length > 0 && (
              <div className="mt-8">
                <h3 className="mb-3 font-medium">New Images</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {newImages.map((image, index) => (
                    <div
                      key={image.path}
                      className="relative overflow-hidden rounded-xl border border-blue-900"
                    >
                      <div className="relative aspect-square w-full">
                        <Image
                          src={image.url}
                          alt={`New image ${index + 1}`}
                          fill
                          sizes="(max-width: 768px) 50vw, 25vw"
                          className="object-cover"
                        />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-blue-950/80 px-3 py-2 text-xs">
                        Will be saved
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-8 border-t border-slate-800 pt-8">
              <h3 className="font-medium">Add More Images</h3>
              <p className="mt-2 text-sm text-slate-400">
                Paste screenshots with Ctrl + V or upload image files.
              </p>
              <div className="mt-4">
                <ImageUploader onImagesChange={(uploadedImages) => setNewImages(uploadedImages)} />
              </div>
            </div>
          </section>

          {!isWhatsAppOnlyProductType(productType) ? (
            <ProductStockSummaryPanel
              summary={stockSummary}
              loading={stockLoading}
              manageHref={inventoryManageHref(productId)}
            />
          ) : (
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h3 className="font-medium">Inventory</h3>
              <p className="mt-2 text-sm text-slate-400">
                Top Up is WhatsApp-only and does not use inventory assignment.
              </p>
            </section>
          )}

          {error && (
            <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-400">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl border border-green-900 bg-green-950/40 p-4 text-sm text-green-400">
              {success}
            </div>
          )}

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur-md lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto flex max-w-5xl gap-3 lg:justify-end">
              <Link
                href="/admin/products"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-700 px-4 py-3 lg:flex-none lg:px-6"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-500 disabled:opacity-50 lg:flex-none lg:px-8"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
    </div>
  );
}
