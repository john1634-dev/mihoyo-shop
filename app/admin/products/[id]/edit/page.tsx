"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
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
          "id,title,slug,game_id,price,currency,server,region_code,ar_level,description,supplier_name,shopee_url,status,cost_vnd,cost_myr,vnd_myr_rate,cost_rate_updated_at"
        )
        .eq("id", productId)
        .single();

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
    }

    void loadData();
    const timer = window.setTimeout(() => {
      void fetchRate(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [productId]);

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

    const productUpdate = await supabase
      .from("products")
      .update(updatePayload)
      .eq("id", productId);

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
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <div className="mx-auto max-w-5xl">Loading product...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white md:p-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin/products" className="text-sm text-slate-400 hover:text-white">
          ← Back to Products
        </Link>

        <h1 className="mt-5 text-3xl font-bold">Edit Product</h1>

        <form onSubmit={saveChanges} className="mt-8 space-y-8">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Basic Information</h2>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-slate-300">Game</label>
                <select
                  value={gameId}
                  onChange={(event) => setGameId(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                >
                  <option value="">Select a game</option>
                  {games.map((game) => (
                    <option key={game.id} value={game.id}>
                      {game.name}
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
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Slug</label>
                <input
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Currency</label>
                <select
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                >
                  {SUPPORTED_CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Server</label>
                <input
                  value={server}
                  onChange={(event) => setServer(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Region</label>
                <select
                  value={regionCode}
                  onChange={(event) => setRegionCode(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                >
                  <option value="">Not set</option>
                  {REGION_OPTIONS.map((region) => (
                    <option key={region.code} value={region.code}>
                      {region.label} ({region.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">AR / Level</label>
                <input
                  type="number"
                  value={arLevel}
                  onChange={(event) => setArLevel(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-slate-300">Description</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={8}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </div>
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
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-blue-500 disabled:opacity-50"
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

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Product Status</h2>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-5 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
            >
              <option value="available">Available</option>
              <option value="sold">Sold</option>
              <option value="hidden">Hidden</option>
            </select>
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

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Product Images</h2>
            <p className="mt-1 text-sm text-slate-400">The first image is the cover image.</p>
            {images.length > 0 && (
              <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                {images.map((image, index) => (
                  <div key={image.id} className="relative overflow-hidden rounded-xl border border-slate-800">
                    <div className="relative aspect-square w-full">
                      <Image
                        src={image.image_url}
                        alt={`Product image ${index + 1}`}
                        fill
                        sizes="(max-width: 768px) 50vw, 25vw"
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
                      onClick={() => void deleteImage(image)}
                      className="absolute right-2 top-2 rounded-lg bg-black/70 px-3 py-1 text-xs hover:bg-red-600"
                    >
                      Delete
                    </button>
                    <div className="absolute left-2 top-2 flex gap-1">
                      <button
                        type="button"
                        onClick={() => void moveImage(image.id, "left")}
                        disabled={index === 0}
                        className="rounded-lg bg-black/70 px-2 py-1 text-xs disabled:opacity-30"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={() => void moveImage(image.id, "right")}
                        disabled={index === images.length - 1}
                        className="rounded-lg bg-black/70 px-2 py-1 text-xs disabled:opacity-30"
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
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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

          <div className="flex justify-end gap-4">
            <Link href="/admin/products" className="rounded-xl border border-slate-700 px-6 py-3">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-600 px-8 py-3 font-semibold hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
