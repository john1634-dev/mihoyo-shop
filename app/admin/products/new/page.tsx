"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ImageUploader from "@/components/ImageUploader";
import { createSlug } from "@/lib/validation";
import {
  computeCostMyr,
  computeProfit,
  formatMyr,
  formatRate,
  formatVndInput,
  MAX_COST_VND,
  parseVndInput,
} from "@/lib/costing";
import {
  ADMIN_CREATABLE_PRODUCT_TYPES,
  getProductTypeLabel,
  isAdminCreatableProductType,
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

type UploadedImage = {
  url: string;
  path: string;
};

type ExchangeRateResponse = {
  success: boolean;
  from?: string;
  to?: string;
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

export default function NewProductPage() {
  const router = useRouter();

  const [games, setGames] = useState<Game[]>([]);
  const [images, setImages] = useState<UploadedImage[]>([]);

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
  const [manualRateRefresh, setManualRateRefresh] = useState(false);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateState, setRateState] = useState<RateState>({
    rate: null,
    updatedAt: null,
    source: null,
  });
  const [rateError, setRateError] = useState("");

  const [loadingGames, setLoadingGames] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const costVnd = useMemo(() => parseVndInput(costVndInput), [costVndInput]);
  const sellingPrice = Number(price);
  const safeSellingPrice = Number.isFinite(sellingPrice) ? sellingPrice : 0;

  const costMyrPreview =
    costVnd !== null && rateState.rate !== null
      ? computeCostMyr(costVnd, rateState.rate)
      : null;

  const profitMetrics =
    costMyrPreview !== null && safeSellingPrice > 0
      ? computeProfit(safeSellingPrice, costMyrPreview)
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
        throw new Error(
          data.error || "Could not fetch current VND to MYR exchange rate."
        );
      }

      setRateState({
        rate: data.rate,
        updatedAt: data.updatedAt || new Date().toISOString(),
        source: data.source || null,
      });
      if (force) {
        setManualRateRefresh(true);
      }
    } catch (err) {
      setRateError(
        err instanceof Error
          ? err.message
          : "Could not update exchange rate."
      );
    } finally {
      setRateLoading(false);
    }
  }

  useEffect(() => {
    async function loadGames() {
      setLoadingGames(true);

      const { data, error: gamesError } = await supabase
        .from("games")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order");

      if (gamesError) {
        setError(gamesError.message);
      } else {
        setGames(data || []);
      }
      setLoadingGames(false);
    }

    void loadGames();
    const timer = window.setTimeout(() => {
      void fetchRate(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slug) {
      setSlug(createSlug(value));
    }
  }

  function handleCostInput(value: string) {
    setCostVndInput(formatVndInput(value));
  }

  async function createProduct(event: FormEvent) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    if (!title.trim()) {
      setError("Please enter a product name.");
      setSaving(false);
      return;
    }

    const finalSlug = createSlug(slug || title);
    if (!finalSlug) {
      setError("Please enter a valid slug.");
      setSaving(false);
      return;
    }

    if (!price || Number(price) < 0) {
      setError("Please enter a valid price.");
      setSaving(false);
      return;
    }

    if (costVndInput && costVnd === null) {
      setError(`Purchase cost must be between 1 and ${MAX_COST_VND} VND.`);
      setSaving(false);
      return;
    }

    if (costVnd !== null && (!rateState.rate || rateState.rate <= 0)) {
      setError(
        "Unable to fetch current exchange rate. Please refresh rate and try again."
      );
      setSaving(false);
      return;
    }

    const coverImage = images.length > 0 ? images[0].url : null;
    const nowIso = new Date().toISOString();
    const computedCostMyr =
      costVnd !== null && rateState.rate !== null
        ? computeCostMyr(costVnd, rateState.rate)
        : null;

    let productResult = await supabase
      .from("products")
      .insert({
        title: title.trim(),
        slug: finalSlug,
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
        cover_image_url: coverImage,
        cost_vnd: costVnd,
        cost_myr: computedCostMyr,
        vnd_myr_rate: costVnd !== null ? rateState.rate : null,
        cost_currency: costVnd !== null ? "VND" : null,
        cost_rate_updated_at: costVnd !== null ? nowIso : null,
      })
      .select("id")
      .single();

    if (
      productResult.error &&
      /product_type|column|schema/i.test(productResult.error.message)
    ) {
      productResult = await supabase
        .from("products")
        .insert({
          title: title.trim(),
          slug: finalSlug,
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
          cover_image_url: coverImage,
          cost_vnd: costVnd,
          cost_myr: computedCostMyr,
          vnd_myr_rate: costVnd !== null ? rateState.rate : null,
          cost_currency: costVnd !== null ? "VND" : null,
          cost_rate_updated_at: costVnd !== null ? nowIso : null,
        })
        .select("id")
        .single();
    }

    if (productResult.error) {
      setError(productResult.error.message);
      setSaving(false);
      return;
    }

    const productId = productResult.data.id;

    if (images.length > 0) {
      const imageRows = images.map((image, index) => ({
        product_id: productId,
        image_url: image.url,
        image_path: image.path,
        sort_order: index,
      }));

      const imageResult = await supabase.from("product_images").insert(imageRows);
      if (imageResult.error) {
        setError(
          "Product created, but images failed to save: " + imageResult.error.message
        );
        setSaving(false);
        return;
      }
    }

    setSuccess("Product created successfully.");
    setTimeout(() => {
      router.push("/admin/products");
      router.refresh();
    }, 800);
  }

  if (loadingGames) {
    return (
      <div className="mx-auto min-w-0 max-w-5xl px-4 py-8 sm:px-6">
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

        <h1 className="mt-5 text-2xl font-bold sm:text-3xl">Add Product</h1>
        <p className="mt-2 text-slate-400">
          Create a new game account or top up listing.
        </p>

        <form onSubmit={createProduct} className="mt-8 space-y-6 pb-28 lg:space-y-8 lg:pb-0">
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
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
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
                  onChange={(event) => handleTitleChange(event.target.value)}
                  placeholder="Example: Genshin Impact AR60"
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Slug</label>
                <input
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder="genshin-impact-ar60"
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder="299.00"
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
                  placeholder="Asia / America / Europe"
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
                  min="0"
                  value={arLevel}
                  onChange={(event) => setArLevel(event.target.value)}
                  placeholder="60"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-slate-300">Description</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={8}
                  placeholder="Account details..."
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
                  Internal only. Never visible to customers.
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
                <p className="mt-2 text-xs text-slate-500">
                  Max {MAX_COST_VND.toLocaleString("en-US")} VND
                </p>
              </div>
              <div className="self-end rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300">
                VND
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">MYR Preview</p>
              <p className="mt-1 text-2xl font-semibold">
                {costMyrPreview !== null ? formatMyr(costMyrPreview) : "—"}
              </p>
              <p className="mt-3 text-sm text-slate-400">
                {rateState.rate
                  ? `1 VND = RM ${formatRate(rateState.rate)}`
                  : "Rate unavailable"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {rateState.updatedAt
                  ? `Updated ${new Date(rateState.updatedAt).toLocaleString("en-MY")}`
                  : "No rate update yet"}
                {rateState.source ? ` · ${rateState.source}` : ""}
              </p>
              {manualRateRefresh && (
                <p className="mt-2 text-xs text-emerald-400">Rate updated.</p>
              )}
              {rateError && <p className="mt-2 text-xs text-red-400">{rateError}</p>}
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Profit Overview</p>
              {profitMetrics ? (
                <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                  <p>Purchase Cost: {formatMyr(costMyrPreview ?? 0)}</p>
                  <p>Selling Price: {formatMyr(safeSellingPrice)}</p>
                  <p
                    className={
                      profitMetrics.profit >= 0 ? "text-emerald-400" : "text-red-400"
                    }
                  >
                    {profitMetrics.profit >= 0 ? "Estimated Profit" : "Estimated Loss"}:{" "}
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
                  placeholder="Supplier name"
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
              <p className="mt-2 text-xs text-slate-500">
                Leave empty to use the global Baitu Games Shopee store link.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Product Images</h2>
            <p className="mt-1 text-sm text-slate-400">
              The first image will automatically become the cover image.
            </p>
            <div className="mt-6">
              <ImageUploader onImagesChange={(uploadedImages) => setImages(uploadedImages)} />
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
                {saving ? "Creating..." : "Create Product"}
              </button>
            </div>
          </div>
        </form>
    </div>
  );
}
