"use client";

import { formatMyr, formatVnd } from "@/lib/costing";
import {
  normalizeSupplierSourceStatus,
  supplierSourceStatusLabel,
} from "@/lib/supplier/status";

export type SupplierSyncDiffData = {
  productId: string | null;
  source: string;
  externalProductId: string;
  syncStatus: string;
  originalTitle: string;
  currentTitle: string | null;
  newTranslatedTitle: string;
  markupPercent: number;
  profitMyr: { old: number | null; new: number | null };
  storefrontStatus: string | null;
  storefrontRecommendation: string | null;
  storefrontReviewMessage: string | null;
  imageImportStatus: "pending";
  canSync: boolean;
  syncMessage: string | null;
  sourcePrice?: number;
  translatedTitle?: string;
  changes: {
    title?: { old: string; new: string };
    price?: { old: number; new: number };
    sourcePrice?: { old: number; new: number };
    costMyr?: { old: number; new: number };
    sourceStatus?: { old: string; new: string };
    description?: { old: string; new: string };
    images?: { changed: boolean; oldCount: number; newCount: number };
  };
};

type SupplierSyncDiffCardProps = {
  diff: SupplierSyncDiffData;
  onConfirmSync?: () => void;
  syncLoading?: boolean;
};

function syncStatusLabel(status: string): string {
  switch (status) {
    case "new":
      return "New";
    case "unchanged":
      return "Unchanged";
    case "price_changed":
      return "Price Changed";
    case "title_changed":
      return "Title Changed";
    case "status_changed":
      return "Status Changed";
    case "multiple_changes":
      return "Multiple Changes";
    case "delisted":
      return "Delisted";
    case "error":
      return "Error";
    default:
      return status;
  }
}

function syncStatusClass(status: string): string {
  switch (status) {
    case "new":
      return "border-sky-500/40 bg-sky-500/10 text-sky-300";
    case "unchanged":
      return "border-slate-600 bg-slate-800 text-slate-300";
    case "price_changed":
      return "border-amber-500/40 bg-amber-500/10 text-amber-300";
    case "title_changed":
      return "border-violet-500/40 bg-violet-500/10 text-violet-300";
    case "status_changed":
    case "delisted":
      return "border-orange-500/40 bg-orange-500/10 text-orange-300";
    case "multiple_changes":
      return "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300";
    case "error":
      return "border-red-500/40 bg-red-500/10 text-red-300";
    default:
      return "border-slate-600 bg-slate-800 text-slate-300";
  }
}

export default function SupplierSyncDiffCard({
  diff,
  onConfirmSync,
  syncLoading = false,
}: SupplierSyncDiffCardProps) {
  const { changes } = diff;

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {diff.externalProductId}
          </p>
          <p className="mt-1 line-clamp-2 text-sm font-medium text-white">
            {diff.newTranslatedTitle || diff.translatedTitle}
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${syncStatusClass(diff.syncStatus)}`}
        >
          {syncStatusLabel(diff.syncStatus)}
        </span>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div>
          <dt className="text-xs uppercase text-slate-500">Original (Vietnamese)</dt>
          <dd className="text-slate-300">{diff.originalTitle}</dd>
        </div>

        {diff.currentTitle && (
          <div>
            <dt className="text-xs uppercase text-slate-500">Current BaituGames</dt>
            <dd className="text-slate-300">{diff.currentTitle}</dd>
          </div>
        )}

        {changes.title && (
          <div>
            <dt className="text-xs uppercase text-slate-500">New English</dt>
            <dd className="text-emerald-300">{changes.title.new}</dd>
          </div>
        )}

        {changes.sourcePrice && (
          <div>
            <dt className="text-xs uppercase text-slate-500">Supplier Price</dt>
            <dd className="text-slate-300">
              {formatVnd(changes.sourcePrice.old)} → {formatVnd(changes.sourcePrice.new)}
            </dd>
          </div>
        )}

        {changes.costMyr && (
          <div>
            <dt className="text-xs uppercase text-slate-500">Cost</dt>
            <dd className="text-slate-300">
              {formatMyr(changes.costMyr.old)} → {formatMyr(changes.costMyr.new)}
            </dd>
          </div>
        )}

        {changes.price && (
          <div>
            <dt className="text-xs uppercase text-slate-500">Selling Price</dt>
            <dd className="text-slate-300">
              {formatMyr(changes.price.old)} → {formatMyr(changes.price.new)}
            </dd>
          </div>
        )}

        {(changes.price || changes.costMyr) && (
          <>
            <div>
              <dt className="text-xs uppercase text-slate-500">Markup</dt>
              <dd className="text-slate-300">{diff.markupPercent}%</dd>
            </div>
            {(diff.profitMyr.old != null || diff.profitMyr.new != null) && (
              <div>
                <dt className="text-xs uppercase text-slate-500">Profit</dt>
                <dd className="text-slate-300">
                  {diff.profitMyr.old != null ? formatMyr(diff.profitMyr.old) : "—"} →{" "}
                  {diff.profitMyr.new != null ? formatMyr(diff.profitMyr.new) : "—"}
                </dd>
              </div>
            )}
          </>
        )}

        {changes.sourceStatus && (
          <div>
            <dt className="text-xs uppercase text-slate-500">Supplier Status</dt>
            <dd className="text-slate-300">
              {supplierSourceStatusLabel(
                normalizeSupplierSourceStatus(changes.sourceStatus.old)
              )}{" "}
              →{" "}
              {supplierSourceStatusLabel(
                normalizeSupplierSourceStatus(changes.sourceStatus.new)
              )}
            </dd>
          </div>
        )}

        {diff.storefrontRecommendation && (
          <div>
            <dt className="text-xs uppercase text-slate-500">Storefront Recommendation</dt>
            <dd className="text-amber-300">
              {diff.storefrontStatus ?? "available"} → {diff.storefrontRecommendation}
            </dd>
          </div>
        )}

        {diff.storefrontReviewMessage && (
          <p className="text-xs text-amber-400">{diff.storefrontReviewMessage}</p>
        )}

        {changes.images?.changed && (
          <div>
            <dt className="text-xs uppercase text-slate-500">Images</dt>
            <dd className="text-slate-300">
              Image changes detected — {changes.images.oldCount} → {changes.images.newCount}
            </dd>
          </div>
        )}
      </dl>

      {diff.syncMessage && (
        <p className="mt-3 text-xs text-slate-400">{diff.syncMessage}</p>
      )}

      {diff.canSync && diff.productId && onConfirmSync && (
        <button
          type="button"
          onClick={onConfirmSync}
          disabled={syncLoading}
          className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
        >
          {syncLoading ? "Syncing..." : "Confirm Sync"}
        </button>
      )}
    </article>
  );
}
