import {
  formatAdminStockLine,
  stockLevelFromAvailable,
  stockLevelLabel,
  type ProductStockSummary,
} from "@/lib/inventory-stock";

const LEVEL_STYLES = {
  in_stock: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  low_stock: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  out_of_stock: "border-red-500/30 bg-red-500/10 text-red-300",
} as const;

type ProductStockBadgeProps = {
  availableCount: number;
  compact?: boolean;
};

export function ProductStockBadge({
  availableCount,
  compact = false,
}: ProductStockBadgeProps) {
  const level = stockLevelFromAvailable(availableCount);

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${LEVEL_STYLES[level]}`}
    >
      {compact ? formatAdminStockLine(availableCount) : stockLevelLabel(level)}
    </span>
  );
}

type ProductStockSummaryPanelProps = {
  summary: ProductStockSummary | null;
  loading?: boolean;
  manageHref?: string;
};

export function ProductStockSummaryPanel({
  summary,
  loading = false,
  manageHref,
}: ProductStockSummaryPanelProps) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="h-4 w-32 rounded bg-slate-800" />
        <div className="h-16 rounded bg-slate-800" />
      </div>
    );
  }

  const rows = summary
    ? [
        { label: "Available", value: summary.available_count },
        { label: "Reserved", value: summary.reserved_count },
        { label: "Assigned", value: summary.assigned_count },
        { label: "Delivered", value: summary.delivered_count },
        { label: "Consumed", value: summary.consumed_count },
        { label: "Void", value: summary.void_count },
      ]
    : [];

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Stock / Inventory Summary</h2>
          <p className="mt-1 text-xs text-slate-400">
            Read-only counts from encrypted inventory units. Not editable here.
          </p>
        </div>
        {summary && (
          <ProductStockBadge availableCount={summary.available_count} />
        )}
      </div>

      {!summary ? (
        <p className="mt-4 text-sm text-slate-400">Stock summary unavailable.</p>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.label}
              className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3"
            >
              <dt className="text-xs text-slate-500">{row.label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{row.value}</dd>
            </div>
          ))}
          <div className="col-span-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 sm:col-span-3">
            <dt className="text-xs text-slate-500">Total units</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {summary.total_count}
            </dd>
          </div>
        </dl>
      )}

      {manageHref && (
        <a
          href={manageHref}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-blue-500/40 px-4 py-2.5 text-sm font-medium text-blue-200 hover:border-blue-400 sm:w-auto"
        >
          Manage Inventory
        </a>
      )}
    </section>
  );
}
