"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import SupplierProductPreviewCard, {
  type SupplierPreviewData,
} from "@/components/admin/SupplierProductPreviewCard";
import SupplierSyncDiffCard, {
  type SupplierSyncDiffData,
} from "@/components/admin/SupplierSyncDiffCard";
import { adminFetch } from "@/lib/admin-api";
import { formatMyr, formatVnd } from "@/lib/costing";
import { supabase } from "@/lib/supabase";

type Game = { id: string; name: string };

type ListingItem = {
  externalProductId: string;
  externalProductUrl: string;
  title?: string | null;
  coverImageUrl?: string | null;
  price?: number | null;
  currency?: string | null;
};

type ListingResponse = {
  source: string;
  page: number;
  listingUrl: string;
  items: ListingItem[];
  pagination: { kind: "none" | "not_detected" | "query"; param?: string; page?: number };
  warnings: string[];
};

type ImportSuccess = {
  imported: true;
  productId: string;
  title: string;
  sellingPriceMyr: number;
};

type ImportFailure = {
  imported: false;
  reason: string;
  productId?: string;
  message?: string;
};

type SyncListingResponse = {
  source: string;
  page: number;
  pagination: ListingResponse["pagination"];
  warnings: string[];
  summary: Record<string, number>;
  items: SupplierSyncDiffData[];
};

type SyncApplySuccess = {
  synced: true;
  productId: string;
  syncStatus: string;
  updatedFields: string[];
};

type SyncApplyFailure = {
  synced: false;
  reason: string;
  message?: string;
};

type AutoSyncDetail = {
  productId: string;
  externalProductId: string;
  title: string;
  action: string;
  oldPrice: number | null;
  newPrice: number | null;
  priceChangePercent: number | null;
  oldStatus: string | null;
  newStatus: string | null;
  reason: string | null;
};

type AutoSyncResult = {
  dryRun: boolean;
  sourceUnavailable?: boolean;
  checked: number;
  priceUpdated: number;
  statusUpdated: number;
  unchanged: number;
  requiresReview: number;
  errors: number;
  skipped: number;
  newProducts?: number;
  wouldUpdatePrice?: number;
  wouldUpdateStatus?: number;
  details: AutoSyncDetail[];
};

type AutoImportDetail = {
  externalProductId: string;
  category: string;
  title: string;
  translatedTitle: string | null;
  action: string;
  reason: string | null;
};

type AutoImportResult = {
  dryRun: boolean;
  sourceUnavailable?: boolean;
  checked: number;
  newProducts: number;
  alreadyImported: number;
  skipped: number;
  imported: number;
  translationFailures: number;
  gameMappingFailures: number;
  imageReady: number;
  imagesImported: number;
  errors: number;
  details: AutoImportDetail[];
};

type SyncRunRow = {
  id: string;
  supplier: string;
  trigger_type: "cron" | "manual";
  status: "running" | "completed" | "failed" | "source_unavailable";
  started_at: string;
  finished_at: string | null;
  checked: number;
  price_updated: number;
  status_updated: number;
  requires_review: number;
  errors: number;
  unchanged: number;
  skipped: number;
  new_products: number;
  duration_ms: number | null;
  error_message: string | null;
};

type ImageImportSuccess = {
  imported: true;
  productId: string;
  imagesProcessed: number;
  imagesSkipped: number;
  imagesFailed: number;
  imagesAlreadyImported: number;
  coverImageUrl: string | null;
  items?: Array<{
    imageUrl: string;
    processedImageUrl: string | null;
    processingStatus: string;
  }>;
};

type ImageImportFailure = {
  imported: false;
  reason: string;
  message?: string;
};

function formatSyncRunDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDurationMs(durationMs: number | null): string {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) return "—";
  return `${(durationMs / 1000).toFixed(1)}s`;
}

export default function ZinkGameSupplierPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [productUrl, setProductUrl] = useState("");
  const [productId, setProductId] = useState("");
  const [markupPercent, setMarkupPercent] = useState(100);
  const [selectedGameId, setSelectedGameId] = useState("");

  const [preview, setPreview] = useState<SupplierPreviewData | null>(null);
  const [listing, setListing] = useState<ListingResponse | null>(null);
  const [listingLoading, setListingLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [syncListing, setSyncListing] = useState<SyncListingResponse | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncProductLoading, setSyncProductLoading] = useState<string | null>(null);
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [syncConfirmTarget, setSyncConfirmTarget] = useState<SupplierSyncDiffData | null>(
    null
  );

  const [autoSyncIntroOpen, setAutoSyncIntroOpen] = useState(false);
  const [autoSyncResult, setAutoSyncResult] = useState<AutoSyncResult | null>(null);
  const [autoSyncLoading, setAutoSyncLoading] = useState(false);
  const [autoSyncConfirmOpen, setAutoSyncConfirmOpen] = useState(false);

  const [autoImportResult, setAutoImportResult] = useState<AutoImportResult | null>(
    null
  );
  const [autoImportLoading, setAutoImportLoading] = useState(false);
  const [autoImportConfirmOpen, setAutoImportConfirmOpen] = useState(false);

  const [imageImportLoading, setImageImportLoading] = useState(false);
  const [imageImportConfirmOpen, setImageImportConfirmOpen] = useState(false);
  const [imageImportTargetId, setImageImportTargetId] = useState<string | null>(null);

  const [syncRuns, setSyncRuns] = useState<SyncRunRow[]>([]);
  const [syncRunsLoading, setSyncRunsLoading] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const previewSectionRef = useRef<HTMLElement | null>(null);
  const productUrlInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    async function loadGames() {
      const { data, error: gamesError } = await supabase
        .from("games")
        .select("id,name")
        .order("name", { ascending: true });

      if (gamesError) {
        setError(gamesError.message);
        return;
      }

      setGames((data ?? []) as Game[]);
    }

    void loadGames();
    void loadSyncRuns();
  }, []);

  function scrollToPreviewSection() {
    previewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => productUrlInputRef.current?.focus(), 250);
  }

  function handleHeaderPreview() {
    const url = productUrl.trim();
    const id = productId.trim().toLowerCase();
    if (url || id) {
      void handlePreviewSubmit();
      return;
    }
    scrollToPreviewSection();
  }

  function handleHeaderImportProduct() {
    if (preview?.importStatus?.canImport) {
      setConfirmOpen(true);
      return;
    }
    scrollToPreviewSection();
  }

  async function loadSyncRuns() {
    setSyncRunsLoading(true);
    try {
      const response = await adminFetch(
        "/api/admin/suppliers/zinkgame/sync/runs?limit=20"
      );
      const data = (await response.json()) as { runs?: SyncRunRow[]; error?: string };
      if (response.ok) {
        setSyncRuns(data.runs ?? []);
      }
    } catch {
      // History is non-blocking — keep the rest of the page usable.
    } finally {
      setSyncRunsLoading(false);
    }
  }

  const paginationLabel = useMemo(() => {
    if (!listing) return "";
    if (listing.pagination.kind === "not_detected") {
      return "Pagination not detected — showing page 1 only.";
    }
    if (listing.pagination.kind === "none") {
      return "Page 1 (single-page listing detected).";
    }
    return `Page ${listing.page} (query pagination detected).`;
  }, [listing]);

  const fetchPreview = useCallback(
    async (
      input: { productId?: string; url?: string },
      nextMarkup?: number
    ) => {
      setPreviewLoading(true);
      setError("");
      setSuccess("");

      try {
        const response = await adminFetch("/api/admin/suppliers/zinkgame/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...input,
            markupPercent: nextMarkup ?? markupPercent,
          }),
        });

        const data = (await response.json()) as SupplierPreviewData & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Preview failed.");
        }

        setPreview(data);
        setMarkupPercent(data.markupPercent);
      } catch (fetchError) {
        setPreview(null);
        setError(
          fetchError instanceof Error ? fetchError.message : "Preview failed."
        );
      } finally {
        setPreviewLoading(false);
      }
    },
    [markupPercent]
  );

  async function handlePreviewSubmit() {
    const url = productUrl.trim();
    const id = productId.trim().toLowerCase();

    if (!url && !id) {
      setError("Enter a product URL or product ID.");
      return;
    }

    if (url && id) {
      setError("Enter either URL or product ID, not both.");
      return;
    }

    await fetchPreview(url ? { url } : { productId: id });
  }

  async function handleFetchListing() {
    setListingLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await adminFetch(
        "/api/admin/suppliers/zinkgame/listing?page=1"
      );
      const data = (await response.json()) as ListingResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Listing fetch failed.");
      }

      setListing(data);
    } catch (fetchError) {
      setListing(null);
      setError(
        fetchError instanceof Error ? fetchError.message : "Listing fetch failed."
      );
    } finally {
      setListingLoading(false);
    }
  }

  async function refreshPreviewWithMarkup(nextMarkup: number) {
    if (!preview) return;
    setMarkupPercent(nextMarkup);
    await fetchPreview({ productId: preview.product.externalProductId });
  }

  async function handleSyncCheck() {
    setSyncLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await adminFetch(
        "/api/admin/suppliers/zinkgame/sync/listing?page=1"
      );
      const data = (await response.json()) as SyncListingResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Sync check failed.");
      }

      setSyncListing(data);
    } catch (fetchError) {
      setSyncListing(null);
      setError(
        fetchError instanceof Error ? fetchError.message : "Sync check failed."
      );
    } finally {
      setSyncLoading(false);
    }
  }

  function openSyncConfirm(diff: SupplierSyncDiffData) {
    setSyncConfirmTarget(diff);
    setSyncConfirmOpen(true);
  }

  async function handleSyncConfirm() {
    if (!syncConfirmTarget?.productId) return;

    const targetId = syncConfirmTarget.productId;
    setSyncProductLoading(targetId);
    setError("");
    setSuccess("");

    try {
      const response = await adminFetch("/api/admin/suppliers/zinkgame/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: targetId,
          confirm: true,
        }),
      });

      const data = (await response.json()) as SyncApplySuccess | SyncApplyFailure;

      if (!response.ok || !("synced" in data) || !data.synced) {
        const failure = data as SyncApplyFailure;
        setError(failure.message || "Sync failed.");
        return;
      }

      const ok = data as SyncApplySuccess;
      setSuccess(
        `Synced successfully — status: ${ok.syncStatus}. Updated: ${ok.updatedFields.join(", ")}`
      );
      setSyncConfirmOpen(false);
      setSyncConfirmTarget(null);
      await handleSyncCheck();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Sync failed.");
    } finally {
      setSyncProductLoading(null);
    }
  }

  async function runAutoSync(confirm: boolean) {
    setAutoSyncLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await adminFetch("/api/admin/suppliers/zinkgame/sync/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });

      const data = (await response.json()) as AutoSyncResult & {
        error?: string;
        sourceUnavailable?: boolean;
        status?: string;
      };

      if (response.status === 409 || data.status === "already_running") {
        throw new Error("A ZinkGame sync is already running. Try again shortly.");
      }

      if (!response.ok) {
        throw new Error(data.error || "Auto sync failed.");
      }

      setAutoSyncResult(data);

      if (confirm) {
        setSuccess(
          `Auto sync complete — ${data.priceUpdated} price, ${data.statusUpdated} status updates.`
        );
        setAutoSyncConfirmOpen(false);
        setAutoSyncIntroOpen(false);
        await loadSyncRuns();
      }
    } catch (autoSyncError) {
      setAutoSyncResult(null);
      setError(
        autoSyncError instanceof Error ? autoSyncError.message : "Auto sync failed."
      );
    } finally {
      setAutoSyncLoading(false);
    }
  }

  async function runAutoImport(confirm: boolean) {
    setAutoImportLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await adminFetch(
        "/api/admin/suppliers/zinkgame/auto-import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm }),
        }
      );

      const data = (await response.json()) as AutoImportResult & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Auto import failed.");
      }

      setAutoImportResult(data);

      if (confirm) {
        setSuccess(
          `Auto import complete — ${data.imported} imported, ${data.alreadyImported} already imported, ${data.skipped} skipped.`
        );
        setAutoImportConfirmOpen(false);
      }
    } catch (autoImportError) {
      setAutoImportResult(null);
      setError(
        autoImportError instanceof Error
          ? autoImportError.message
          : "Auto import failed."
      );
    } finally {
      setAutoImportLoading(false);
    }
  }

  function openImageImportConfirm(productId: string) {
    setImageImportTargetId(productId);
    setImageImportConfirmOpen(true);
  }

  async function handleImageImportConfirm() {
    if (!imageImportTargetId) return;

    setImageImportLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await adminFetch(
        "/api/admin/suppliers/zinkgame/images/import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: imageImportTargetId,
            confirm: true,
          }),
        }
      );

      const data = (await response.json()) as ImageImportSuccess | ImageImportFailure;

      if (!response.ok || !("imported" in data) || !data.imported) {
        const failure = data as ImageImportFailure;
        setError(failure.message || "Image import failed.");
        return;
      }

      const ok = data as ImageImportSuccess;
      const completed = (ok.items ?? []).filter(
        (item) => item.processingStatus === "completed"
      ).length;
      setSuccess(
        `Image import complete — processed ${ok.imagesProcessed}, skipped ${ok.imagesSkipped}, failed ${ok.imagesFailed}, already imported ${ok.imagesAlreadyImported}, logo removed ${completed}.`
      );
      setImageImportConfirmOpen(false);
      setImageImportTargetId(null);
      if (preview) {
        await fetchPreview({ productId: preview.product.externalProductId });
      }
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : "Image import failed."
      );
    } finally {
      setImageImportLoading(false);
    }
  }

  async function handleImportConfirm() {
    if (!preview) return;

    setImportLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await adminFetch("/api/admin/suppliers/zinkgame/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: preview.product.externalProductId,
          markupPercent,
          gameId: selectedGameId || undefined,
        }),
      });

      const data = (await response.json()) as ImportSuccess | ImportFailure;

      if (!response.ok || !("imported" in data) || !data.imported) {
        const failure = data as ImportFailure;
        if (failure.reason === "already_imported") {
          setError("Already imported.");
        } else if (failure.reason === "game_mapping_required") {
          setError(failure.message || "Game mapping required.");
        } else {
          setError(failure.message || "Import failed.");
        }
        return;
      }

      const ok = data as ImportSuccess;
      setSuccess(
        `Imported successfully — ${ok.title} (${formatMyr(ok.sellingPriceMyr)}). Product ID: ${ok.productId}`
      );
      setConfirmOpen(false);
      await fetchPreview({ productId: preview.product.externalProductId });
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed.");
    } finally {
      setImportLoading(false);
    }
  }

  const confirmDescription = preview
    ? [
        `Title: ${preview.translatedTitle}`,
        `Cost: ${preview.costMyr != null ? formatMyr(preview.costMyr) : "—"}`,
        `Markup: ${markupPercent}%`,
        `Selling: ${preview.sellingPriceMyr != null ? formatMyr(preview.sellingPriceMyr) : "—"}`,
        `Supplier: ZinkGame`,
        `External ID: ${preview.product.externalProductId}`,
        "",
        "Images will not be imported until logo processing is complete.",
      ].join("\n")
    : "";

  const syncConfirmDescription = syncConfirmTarget
    ? [
        `Product: ${syncConfirmTarget.newTranslatedTitle}`,
        `Status: ${syncConfirmTarget.syncStatus}`,
        syncConfirmTarget.storefrontReviewMessage ?? "",
        "",
        "Server will re-fetch supplier data. Storefront status will NOT change automatically.",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const existingProductId = preview?.importStatus?.existingProductId ?? null;

  const imageImportDescription = [
    "Download supplier images, preserve originals, detect/remove ZinkGame logos, upload to storage, and create product_images rows.",
    "",
    `Product ID: ${imageImportTargetId ?? existingProductId ?? "—"}`,
    "",
    "Server will re-fetch live supplier image URLs.",
  ].join("\n");

  const syncSummaryEntries = syncListing
    ? [
        { label: "New", key: "new" },
        { label: "Unchanged", key: "unchanged" },
        { label: "Price Changed", key: "price_changed" },
        { label: "Status Changed", key: "status_changed" },
        { label: "Title Changed", key: "title_changed" },
        { label: "Multiple Changes", key: "multiple_changes" },
        { label: "Delisted", key: "delisted" },
        { label: "Error", key: "error" },
      ]
    : [];

  const autoSyncSummary = autoSyncResult
    ? [
        { label: "Checked", value: autoSyncResult.checked },
        {
          label: autoSyncResult.dryRun ? "Price Updates" : "Price Updated",
          value: autoSyncResult.dryRun
            ? (autoSyncResult.wouldUpdatePrice ?? 0)
            : autoSyncResult.priceUpdated,
        },
        {
          label: autoSyncResult.dryRun ? "Status Updates" : "Status Updated",
          value: autoSyncResult.dryRun
            ? (autoSyncResult.wouldUpdateStatus ?? 0)
            : autoSyncResult.statusUpdated,
        },
        { label: "Requires Review", value: autoSyncResult.requiresReview },
        { label: "New Products", value: autoSyncResult.newProducts ?? 0 },
        { label: "Errors", value: autoSyncResult.errors },
        { label: "Unchanged", value: autoSyncResult.unchanged },
      ]
    : [];

  const latestSyncRun = syncRuns[0] ?? null;

  const autoSyncIntroDescription = [
    "⚠️ Automatic Sync",
    "",
    "This will automatically update:",
    "• Supplier prices (within configured threshold)",
    "• Supplier sold products (available → sold)",
    "• Supplier delisted/unavailable products (available → hidden)",
    "",
    "It will NOT update:",
    "• Titles",
    "• Descriptions",
    "• Images",
    "• Inventory",
    "• Orders",
    "",
    "A dry run preview runs first. Nothing is written until you confirm.",
  ].join("\n");

  return (
    <div className="mx-auto min-w-0 max-w-6xl overflow-x-hidden px-4 py-6 text-white sm:px-6 sm:py-8">
      <Link href="/admin/products" className="text-sm text-slate-400 hover:text-white">
        ← Back to Products
      </Link>

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">ZinkGame Supplier</h1>
          <p className="mt-2 max-w-3xl text-slate-400">
            Fetch supplier listings, preview account-code titles and pricing, then import
            one product at a time. Nothing is written until you confirm import.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button
            type="button"
            onClick={() => {
              setAutoSyncIntroOpen(true);
              setAutoSyncResult(null);
            }}
            disabled={autoSyncLoading}
            className="inline-flex min-h-11 items-center rounded-xl border border-amber-500/50 bg-amber-500/15 px-4 py-2.5 text-sm font-medium text-amber-100 hover:border-amber-400 disabled:opacity-50"
          >
            Sync Now
          </button>
          <button
            type="button"
            onClick={() => void handleHeaderPreview()}
            disabled={previewLoading}
            className="inline-flex min-h-11 items-center rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-medium text-white hover:border-slate-400 disabled:opacity-50"
          >
            {previewLoading ? "Loading..." : "Preview"}
          </button>
          <button
            type="button"
            onClick={handleHeaderImportProduct}
            disabled={importLoading}
            className="inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            + Import Product
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {success && (
        <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {success}
        </p>
      )}

      <section
        ref={previewSectionRef}
        id="zinkgame-preview"
        className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-5"
      >
        <h2 className="text-lg font-semibold">Fetch Product Preview</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs uppercase text-slate-500">Product URL</label>
            <input
              ref={productUrlInputRef}
              value={productUrl}
              onChange={(event) => setProductUrl(event.target.value)}
              placeholder="https://zinkgame.com/product/..."
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs uppercase text-slate-500">Product ID</label>
            <input
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              placeholder="32-character product id"
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handlePreviewSubmit()}
          disabled={previewLoading}
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
        >
          {previewLoading ? "Loading preview..." : "Preview Product"}
        </button>
      </section>

      <section className="mt-6 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Allowed Auto Import Categories</h2>
            <p className="mt-1 text-sm text-slate-400">
              Automatic import is limited to these two account categories. Other
              ZinkGame categories are never fetched or published.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runAutoImport(false)}
            disabled={autoImportLoading}
            className="inline-flex min-h-11 items-center rounded-xl border border-violet-500/50 bg-violet-500/15 px-4 py-2.5 text-sm font-medium text-violet-100 hover:border-violet-400 disabled:opacity-50"
          >
            {autoImportLoading ? "Running..." : "Dry Run Auto Import"}
          </button>
        </div>

        <ul className="mt-4 space-y-2 text-sm text-slate-200">
          <li>
            ✓ Genshin Impact
            <span className="mt-0.5 block text-xs text-slate-500">
              https://zinkgame.com/category/account/genshin-impact
            </span>
          </li>
          <li>
            ✓ Wuthering Waves
            <span className="mt-0.5 block text-xs text-slate-500">
              https://zinkgame.com/category/account/wuthering-waves
            </span>
          </li>
        </ul>

        <div className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-3">
          <p>Markup: 100%</p>
          <p>Translation: AI</p>
          <p>Auto Import: Enabled</p>
          <p>Auto Publish: Enabled</p>
          <p>Images: Auto + Logo Removal</p>
        </div>

        {autoImportResult && (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-slate-300">
              {autoImportResult.dryRun
                ? "Dry run preview — no products were created."
                : "Auto import applied."}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Checked", value: autoImportResult.checked },
                { label: "New", value: autoImportResult.newProducts },
                { label: "Already Imported", value: autoImportResult.alreadyImported },
                { label: "Skipped", value: autoImportResult.skipped },
                { label: "Translation Failures", value: autoImportResult.translationFailures },
                { label: "Game Mapping Failures", value: autoImportResult.gameMappingFailures },
                { label: "Image Ready", value: autoImportResult.imageReady },
                { label: "Errors", value: autoImportResult.errors },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3"
                >
                  <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
                </div>
              ))}
            </div>
            {autoImportResult.dryRun && (
              <button
                type="button"
                onClick={() => setAutoImportConfirmOpen(true)}
                disabled={autoImportLoading}
                className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
              >
                Confirm Auto Import
              </button>
            )}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Fetch Latest Products</h2>
            <p className="mt-1 text-sm text-slate-400">
              Listing discovery only — open a product to preview before import.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleFetchListing()}
            disabled={listingLoading}
            className="inline-flex min-h-11 items-center rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-medium text-white hover:border-slate-400 disabled:opacity-50"
          >
            {listingLoading ? "Fetching..." : "Fetch Page 1"}
          </button>
        </div>

        {listing && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-400">{paginationLabel}</p>
            {listing.warnings.length > 0 && (
              <p className="text-xs text-amber-400">{listing.warnings.join(" · ")}</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {listing.items.map((item) => (
                <button
                  key={item.externalProductId}
                  type="button"
                  onClick={() => {
                    setProductId(item.externalProductId);
                    setProductUrl("");
                    void fetchPreview({ productId: item.externalProductId });
                  }}
                  className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-left hover:border-slate-600"
                >
                  <p className="line-clamp-2 text-sm font-medium text-white">
                    {item.title || item.externalProductId}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">{item.externalProductId}</p>
                  {item.price != null && (
                    <p className="mt-1 text-sm text-slate-300">
                      {formatVnd(item.price)}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">ZinkGame Auto Sync</h2>
            <p className="mt-1 text-sm text-slate-400">
              Safe automatic price and status updates with threshold protection.
              Scheduled every 30 minutes. Dry run first — nothing writes until you
              confirm.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAutoSyncIntroOpen(true);
              setAutoSyncResult(null);
            }}
            disabled={autoSyncLoading}
            className="inline-flex min-h-11 items-center rounded-xl border border-amber-500/50 bg-amber-500/15 px-4 py-2.5 text-sm font-medium text-amber-100 hover:border-amber-400 disabled:opacity-50"
          >
            Auto Sync
          </button>
        </div>

        {autoSyncResult && (
          <div className="mt-5 space-y-5">
            <p className="text-sm text-slate-300">
              {autoSyncResult.dryRun
                ? "Dry run preview — no database changes were made."
                : "Auto sync applied."}
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {autoSyncSummary.map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3"
                >
                  <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-950 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Current Price</th>
                    <th className="px-4 py-3">New Price</th>
                    <th className="px-4 py-3">Change %</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {autoSyncResult.details.map((item) => (
                    <tr key={`${item.productId}-${item.externalProductId}`} className="border-t border-slate-800">
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{item.title}</p>
                        <p className="text-xs text-slate-500">{item.externalProductId}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {item.oldPrice != null ? formatMyr(item.oldPrice) : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {item.newPrice != null ? formatMyr(item.newPrice) : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {item.priceChangePercent != null
                          ? `${item.priceChangePercent.toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            item.action === "requires_review"
                              ? "text-amber-300"
                              : item.action === "error"
                                ? "text-red-300"
                                : "text-slate-300"
                          }
                        >
                          {item.action === "requires_review"
                            ? "MANUAL REVIEW"
                            : item.action.replace(/_/g, " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {autoSyncResult.dryRun && (
              <button
                type="button"
                onClick={() => setAutoSyncConfirmOpen(true)}
                disabled={autoSyncLoading}
                className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
              >
                Confirm Auto Sync
              </button>
            )}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">ZinkGame Sync History</h2>
            <p className="mt-1 text-sm text-slate-400">
              Latest cron and manual auto-sync runs. New products are counted, never imported.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadSyncRuns()}
            disabled={syncRunsLoading}
            className="inline-flex min-h-11 items-center rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-medium text-white hover:border-slate-400 disabled:opacity-50"
          >
            {syncRunsLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {latestSyncRun && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Last Sync</p>
              <p className="mt-1 text-sm font-medium text-white">
                {formatSyncRunDate(latestSyncRun.started_at)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
              <p className="mt-1 text-sm font-medium capitalize text-white">
                {latestSyncRun.status.replace(/_/g, " ")}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Trigger</p>
              <p className="mt-1 text-sm font-medium capitalize text-white">
                {latestSyncRun.trigger_type}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Duration</p>
              <p className="mt-1 text-sm font-medium text-white">
                {formatDurationMs(latestSyncRun.duration_ms)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Checked</p>
              <p className="mt-1 text-2xl font-semibold text-white">{latestSyncRun.checked}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Price Updated</p>
              <p className="mt-1 text-2xl font-semibold text-white">{latestSyncRun.price_updated}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Status Updated</p>
              <p className="mt-1 text-2xl font-semibold text-white">{latestSyncRun.status_updated}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Manual Review</p>
              <p className="mt-1 text-2xl font-semibold text-white">{latestSyncRun.requires_review}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">New Products</p>
              <p className="mt-1 text-2xl font-semibold text-white">{latestSyncRun.new_products}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Errors</p>
              <p className="mt-1 text-2xl font-semibold text-white">{latestSyncRun.errors}</p>
            </div>
          </div>
        )}

        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-950 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Trigger</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Checked</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Review</th>
                <th className="px-4 py-3">Errors</th>
                <th className="px-4 py-3">New</th>
              </tr>
            </thead>
            <tbody>
              {syncRuns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-slate-500">
                    {syncRunsLoading ? "Loading history..." : "No sync runs yet."}
                  </td>
                </tr>
              ) : (
                syncRuns.map((run) => (
                  <tr key={run.id} className="border-t border-slate-800">
                    <td className="px-4 py-3 text-slate-300">{formatSyncRunDate(run.started_at)}</td>
                    <td className="px-4 py-3 capitalize text-slate-300">{run.trigger_type}</td>
                    <td className="px-4 py-3 capitalize text-slate-300">
                      {run.status.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{run.checked}</td>
                    <td className="px-4 py-3 text-slate-300">{run.price_updated}</td>
                    <td className="px-4 py-3 text-slate-300">{run.status_updated}</td>
                    <td className="px-4 py-3 text-slate-300">{run.requires_review}</td>
                    <td className="px-4 py-3 text-slate-300">{run.errors}</td>
                    <td className="px-4 py-3 text-slate-300">{run.new_products}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">ZinkGame Sync Check</h2>
            <p className="mt-1 text-sm text-slate-400">
              Compare live supplier listings with imported products. Nothing updates until
              you confirm sync.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleSyncCheck()}
            disabled={syncLoading}
            className="inline-flex min-h-11 items-center rounded-xl border border-emerald-600/50 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-200 hover:border-emerald-500 disabled:opacity-50"
          >
            {syncLoading ? "Checking..." : "Sync Check"}
          </button>
        </div>

        {syncListing && (
          <div className="mt-5 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {syncSummaryEntries.map(({ label, key }) => (
                <div
                  key={key}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3"
                >
                  <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 text-2xl font-semibold text-white">
                    {syncListing.summary[key] ?? 0}
                  </p>
                </div>
              ))}
            </div>

            {syncListing.warnings.length > 0 && (
              <p className="text-xs text-amber-400">{syncListing.warnings.join(" · ")}</p>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              {syncListing.items.map((item) => (
                <SupplierSyncDiffCard
                  key={item.externalProductId}
                  diff={item}
                  onConfirmSync={
                    item.canSync && item.productId
                      ? () => openSyncConfirm(item)
                      : undefined
                  }
                  syncLoading={syncProductLoading === item.productId}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {preview && (
        <div className="mt-6">
          <SupplierProductPreviewCard
            preview={preview}
            markupPercent={markupPercent}
            onMarkupChange={(value) => {
              if (!Number.isFinite(value) || value < 0) return;
              setMarkupPercent(value);
              void refreshPreviewWithMarkup(value);
            }}
            selectedGameId={selectedGameId}
            onGameChange={setSelectedGameId}
            games={games}
            onImport={() => setConfirmOpen(true)}
            importDisabled={!preview.importStatus?.canImport}
            onImportImages={
              existingProductId
                ? () => openImageImportConfirm(existingProductId)
                : undefined
            }
            importImagesDisabled={!existingProductId}
            loading={previewLoading || importLoading || imageImportLoading}
          />
        </div>
      )}

      <ConfirmDialog
        open={imageImportConfirmOpen}
        title="Import supplier images?"
        description={imageImportDescription}
        confirmLabel="Import Images"
        confirmVariant="primary"
        loading={imageImportLoading}
        loadingLabel="Importing images..."
        onConfirm={() => void handleImageImportConfirm()}
        onCancel={() => {
          setImageImportConfirmOpen(false);
          setImageImportTargetId(null);
        }}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Import this product?"
        description={confirmDescription}
        confirmLabel="Import Product"
        confirmVariant="primary"
        loading={importLoading}
        loadingLabel="Importing..."
        onConfirm={() => void handleImportConfirm()}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={syncConfirmOpen}
        title="Confirm supplier sync?"
        description={syncConfirmDescription}
        confirmLabel="Confirm Sync"
        confirmVariant="primary"
        loading={syncProductLoading != null}
        loadingLabel="Syncing..."
        onConfirm={() => void handleSyncConfirm()}
        onCancel={() => {
          setSyncConfirmOpen(false);
          setSyncConfirmTarget(null);
        }}
      />

      <ConfirmDialog
        open={autoSyncIntroOpen && !autoSyncResult}
        title="Automatic Sync"
        description={autoSyncIntroDescription}
        confirmLabel="Run Dry Run"
        confirmVariant="primary"
        loading={autoSyncLoading}
        loadingLabel="Running dry run..."
        onConfirm={() => void runAutoSync(false)}
        onCancel={() => setAutoSyncIntroOpen(false)}
      />

      <ConfirmDialog
        open={autoSyncConfirmOpen}
        title="Confirm automatic sync?"
        description={[
          "This will apply safe automatic price and status updates.",
          "",
          `Price updates: ${autoSyncResult?.wouldUpdatePrice ?? 0}`,
          `Status updates: ${autoSyncResult?.wouldUpdateStatus ?? 0}`,
          `Requires review (skipped): ${autoSyncResult?.requiresReview ?? 0}`,
          "",
          "Titles, images, and inventory will not be changed.",
        ].join("\n")}
        confirmLabel="Confirm Auto Sync"
        confirmVariant="primary"
        loading={autoSyncLoading}
        loadingLabel="Syncing..."
        onConfirm={() => void runAutoSync(true)}
        onCancel={() => setAutoSyncConfirmOpen(false)}
      />

      <ConfirmDialog
        open={autoImportConfirmOpen}
        title="Confirm category auto import?"
        description={[
          "This will import new products from Genshin Impact and Wuthering Waves only.",
          "",
          `New products: ${autoImportResult?.newProducts ?? 0}`,
          `Already imported: ${autoImportResult?.alreadyImported ?? 0}`,
          `Skipped: ${autoImportResult?.skipped ?? 0}`,
          "",
          "Other categories will not be imported. Existing titles will not change.",
        ].join("\n")}
        confirmLabel="Confirm Auto Import"
        confirmVariant="primary"
        loading={autoImportLoading}
        loadingLabel="Importing..."
        onConfirm={() => void runAutoImport(true)}
        onCancel={() => setAutoImportConfirmOpen(false)}
      />
    </div>
  );
}
