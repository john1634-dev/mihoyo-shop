"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { adminFetch } from "@/lib/admin-api";

type ProductListingStatusControlProps = {
  productId: string;
  productTitle: string;
  status: string;
  onStatusChange: (nextStatus: string) => void;
  onFeedback?: (message: string, type: "success" | "error") => void;
  compact?: boolean;
  className?: string;
};

const LISTING_STATUSES = new Set(["available", "sold", "hidden"]);

export default function ProductListingStatusControl({
  productId,
  productTitle,
  status,
  onStatusChange,
  onFeedback,
  compact = false,
  className = "",
}: ProductListingStatusControlProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<"available" | "sold" | null>(
    null
  );
  const [loading, setLoading] = useState(false);

  const canMarkSold = status === "available";
  const canMarkAvailable = status === "sold";

  if (!canMarkSold && !canMarkAvailable) {
    return null;
  }

  const targetStatus = canMarkSold ? "sold" : "available";

  function openDialog() {
    setPendingStatus(targetStatus);
    setDialogOpen(true);
  }

  async function confirmStatusChange() {
    if (!pendingStatus || loading) return;

    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/products/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          status: pendingStatus,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        status?: string;
      };

      if (!res.ok) {
        onFeedback?.(
          data.error || "Unable to update product status. Please try again.",
          "error"
        );
        return;
      }

      const next = data.status || pendingStatus;
      onStatusChange(next);
      onFeedback?.(
        next === "sold"
          ? "Product marked as sold."
          : "Product is now available.",
        "success"
      );
      setDialogOpen(false);
    } catch {
      onFeedback?.(
        "Unable to update product status. Please try again.",
        "error"
      );
    } finally {
      setLoading(false);
      setPendingStatus(null);
    }
  }

  const buttonLabel = canMarkSold ? "Mark Sold" : "Mark Available";
  const dialogTitle = canMarkSold
    ? "Mark this product as sold?"
    : "Make this product available again?";
  const dialogDescription = canMarkSold
    ? `Product: ${productTitle}\n\nCustomers will no longer be able to purchase this product. Inventory accounts are not deleted.`
    : `Product: ${productTitle}\n\nThis listing will appear on the storefront again when published. Inventory is unchanged.`;
  const loadingLabel = canMarkSold ? "Marking sold..." : "Marking available...";

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={loading}
        aria-label={`${buttonLabel}: ${productTitle}`}
        className={`${compact ? "w-full" : ""} ${className} inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50 sm:text-sm ${
                canMarkSold
                  ? "border-red-500/40 text-red-300 hover:border-red-400 hover:bg-red-500/10"
                  : "border-emerald-500/40 text-emerald-300 hover:border-emerald-400 hover:bg-emerald-500/10"
              }`}
      >
        {buttonLabel}
      </button>

      <ConfirmDialog
        open={dialogOpen}
        title={dialogTitle}
        description={dialogDescription}
        confirmLabel={buttonLabel}
        confirmVariant={canMarkSold ? "danger" : "primary"}
        loading={loading}
        loadingLabel={loadingLabel}
        onConfirm={() => void confirmStatusChange()}
        onCancel={() => {
          if (loading) return;
          setDialogOpen(false);
          setPendingStatus(null);
        }}
      />
    </>
  );
}

export function isListingStatus(value: string): value is "available" | "sold" | "hidden" {
  return LISTING_STATUSES.has(value);
}
