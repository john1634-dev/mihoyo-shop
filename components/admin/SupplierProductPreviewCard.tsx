"use client";

import Image from "next/image";
import { formatMyr, formatVnd } from "@/lib/costing";
import { normalizeSupplierSourceStatus, supplierSourceStatusLabel } from "@/lib/supplier/status";

export type SupplierPreviewData = {
  source: string;
  originalTitle: string;
  translatedTitle: string;
  translationFailed: boolean;
  sourcePrice: number;
  sourceCurrency: string;
  costMyr: number | null;
  markupPercent: number;
  sellingPriceMyr: number | null;
  profitMyr: number | null;
  exchangeRate: number | null;
  exchangeRateUpdatedAt: string | null;
  exchangeRateSource: string | null;
  pricingError: string | null;
  product: {
    externalProductId: string;
    externalProductUrl?: string | null;
    status: string;
    metadata?: Record<string, unknown>;
  };
  images?: Array<{ url: string; sortOrder?: number }>;
  importedImages?: Array<{
    imageUrl: string;
    processedImageUrl: string | null;
    processingStatus: string;
    originalImageUrl?: string | null;
  }>;
  importStatus?: {
    canImport: boolean;
    reason: string | null;
    existingProductId?: string | null;
    message?: string | null;
  };
};

type SupplierProductPreviewCardProps = {
  preview: SupplierPreviewData;
  markupPercent: number;
  onMarkupChange: (value: number) => void;
  selectedGameId: string;
  onGameChange: (gameId: string) => void;
  games: Array<{ id: string; name: string }>;
  onImport: () => void;
  importDisabled?: boolean;
  onImportImages?: () => void;
  importImagesDisabled?: boolean;
  loading?: boolean;
};

function importStatusLabel(preview: SupplierPreviewData): string {
  const status = preview.importStatus;
  if (!status) return "Unknown";
  if (status.reason === "already_imported") return "Already imported";
  if (status.reason === "invalid_supplier_status") return "Not importable (supplier status)";
  if (status.reason === "pricing_unavailable") return "Pricing unavailable";
  if (status.canImport) return "Ready to import";
  return status.message || "Unavailable";
}

export default function SupplierProductPreviewCard({
  preview,
  markupPercent,
  onMarkupChange,
  selectedGameId,
  onGameChange,
  games,
  onImport,
  importDisabled = false,
  onImportImages,
  importImagesDisabled = false,
  loading = false,
}: SupplierProductPreviewCardProps) {
  const category =
    typeof preview.product.metadata?.category === "string"
      ? preview.product.metadata.category
      : null;

  const needsGameMapping =
    preview.importStatus?.reason !== "already_imported" &&
    !selectedGameId &&
    !games.some(
      (game) =>
        category &&
        game.name.toLowerCase().includes(category.toLowerCase().split(" ")[0] ?? "")
    );

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {preview.source} · {preview.product.externalProductId}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">Product Preview</h2>
        </div>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
          Import: {importStatusLabel(preview)}
        </span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase text-slate-500">Original</p>
            <p className="mt-1 text-sm text-slate-200">{preview.originalTitle}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-slate-500">English</p>
            <p className="mt-1 text-sm font-medium text-white">
              {preview.translatedTitle}
            </p>
            {preview.translationFailed && (
              <p className="mt-1 text-xs text-amber-400">Translation failed — showing original.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Supplier price</p>
              <p className="mt-1 text-slate-200">
                {formatVnd(preview.sourcePrice)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Supplier status</p>
              <p className="mt-1 capitalize text-slate-200">
                {supplierSourceStatusLabel(
                  normalizeSupplierSourceStatus(preview.product.status)
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Exchange rate</p>
              <p className="mt-1 text-slate-200">
                {preview.exchangeRate != null ? preview.exchangeRate.toFixed(8) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Cost MYR</p>
              <p className="mt-1 text-slate-200">
                {preview.costMyr != null ? formatMyr(preview.costMyr) : "—"}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium uppercase text-slate-500">
              Markup %
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={markupPercent}
              onChange={(event) => onMarkupChange(Number(event.target.value))}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Selling price</p>
              <p className="mt-1 text-lg font-semibold text-emerald-300">
                {preview.sellingPriceMyr != null
                  ? formatMyr(preview.sellingPriceMyr)
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Profit</p>
              <p className="mt-1 text-lg font-semibold text-slate-200">
                {preview.profitMyr != null ? formatMyr(preview.profitMyr) : "—"}
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium uppercase text-slate-500">
              Game mapping
            </label>
            <select
              value={selectedGameId}
              onChange={(event) => onGameChange(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="">
                {category ? `Auto: ${category}` : "Select game"}
              </option>
              {games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name}
                </option>
              ))}
            </select>
            {needsGameMapping && (
              <p className="mt-1 text-xs text-amber-400">Game mapping required.</p>
            )}
          </div>

          {preview.pricingError && (
            <p className="text-sm text-red-400">{preview.pricingError}</p>
          )}

          {preview.importStatus?.existingProductId && (
            <p className="text-sm text-amber-300">
              Existing product: {preview.importStatus.existingProductId}
            </p>
          )}

          {preview.product.externalProductUrl && (
            <a
              href={preview.product.externalProductUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-sm text-blue-400 hover:text-blue-300"
            >
              View on ZinkGame →
            </a>
          )}
        </div>
      </div>

      {preview.images && preview.images.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-medium uppercase text-slate-500">
            Supplier images (live originals — logo not removed here)
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {preview.images.slice(0, 6).map((image) => (
              <div
                key={image.url}
                className="relative h-16 w-16 overflow-hidden rounded-lg bg-slate-800 ring-1 ring-white/5"
              >
                <Image
                  src={image.url}
                  alt="Supplier original"
                  fill
                  sizes="64px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {preview.importedImages && preview.importedImages.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-medium uppercase text-slate-500">
            Imported images (storefront URL)
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            {preview.importedImages.slice(0, 6).map((image, index) => (
              <div key={`${image.imageUrl}-${index}`} className="w-16">
                <div className="relative h-16 w-16 overflow-hidden rounded-lg bg-slate-800 ring-1 ring-white/5">
                  <Image
                    src={image.imageUrl}
                    alt="Imported"
                    fill
                    sizes="64px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <p className="mt-1 truncate text-[10px] text-slate-500">
                  {image.processingStatus}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onImport}
          disabled={importDisabled || loading || !preview.importStatus?.canImport}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          Import Product
        </button>
        {onImportImages && (
          <button
            type="button"
            onClick={onImportImages}
            disabled={importImagesDisabled || loading}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-violet-500/50 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold text-violet-100 hover:border-violet-400 disabled:opacity-50"
          >
            Import Images
          </button>
        )}
      </div>
    </section>
  );
}
