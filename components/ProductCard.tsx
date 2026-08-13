import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/config";
import { getRegionLabel, normalizeRegionCode } from "@/lib/catalog-meta";
import { getProductBadges, type ProductBadge } from "@/lib/products-public";
import {
  resolveCustomerStockDisplayFromSummary,
  type CustomerStockDisplayLevel,
  type ProductStockSummary,
} from "@/lib/inventory-stock";
import { ArrowRightIcon } from "@/components/icons";
import type { Product } from "@/lib/types";

const PRODUCT_IMAGE_QUALITY = 88;

const BADGE_STYLES: Record<ProductBadge, string> = {
  NEW: "bg-blue-600/90 text-white",
  SOLD_OUT: "bg-slate-800/90 text-slate-300",
};

const STOCK_BADGE_STYLES: Record<CustomerStockDisplayLevel, string> = {
  in_stock: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25",
  low_stock: "bg-amber-500/10 text-amber-300 ring-amber-500/25",
  out_of_stock: "bg-slate-700/80 text-slate-400 ring-slate-600/40",
  manual_available: "bg-blue-500/10 text-blue-300 ring-blue-500/25",
  unavailable: "bg-slate-700/80 text-slate-400 ring-slate-600/40",
};

function locationSummaryLine(product: Product): string | null {
  const parts: string[] = [];
  if (product.ar_level != null) parts.push(`AR ${product.ar_level}`);

  const server = product.server?.trim() || "";
  const regionCode = normalizeRegionCode(product.region_code);
  const regionLabel = getRegionLabel(regionCode);

  if (server && regionCode) {
    if (server.toUpperCase() === regionCode) {
      parts.push(server);
    } else {
      parts.push(`${server} · ${regionCode}`);
    }
  } else if (server) {
    parts.push(server);
  } else if (regionLabel && regionCode) {
    if (regionLabel.toUpperCase() !== regionCode) {
      parts.push(`${regionLabel} · ${regionCode}`);
    } else {
      parts.push(regionCode);
    }
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

type ProductCardProps = {
  product: Product & { games?: { name?: string; slug?: string } | null };
  gameName?: string;
  gameNameById?: Map<string, string>;
  /** @deprecated Prefer stockSummary for inventory-aware display */
  availableStock?: number;
  stockSummary?: Pick<ProductStockSummary, "available_count" | "total_count">;
};

function resolveGameName(
  product: Product & { games?: { name?: string; slug?: string } | null },
  gameName?: string,
  gameNameById?: Map<string, string>
): string | null {
  const explicit = gameName?.trim();
  if (explicit) return explicit;

  if (product.game_id) {
    const fromMap = gameNameById?.get(product.game_id);
    if (fromMap) return fromMap;
  }

  const joined = product.games?.name?.trim();
  return joined || null;
}

function resolveSummary(
  stockSummary: ProductCardProps["stockSummary"],
  availableStock: ProductCardProps["availableStock"]
): Pick<ProductStockSummary, "available_count" | "total_count"> | undefined {
  if (stockSummary) return stockSummary;
  if (availableStock === undefined) return undefined;
  return {
    available_count: availableStock,
    total_count: 0,
  };
}

export default function ProductCard({
  product,
  gameName,
  gameNameById,
  availableStock,
  stockSummary,
}: ProductCardProps) {
  const resolvedSummary = resolveSummary(stockSummary, availableStock);
  const stockDisplay = resolveCustomerStockDisplayFromSummary({
    productStatus: product.status,
    summary: resolvedSummary,
  });
  const resolvedGame = resolveGameName(product, gameName, gameNameById);
  const badges = getProductBadges(
    product,
    stockDisplay.availableCount,
    stockDisplay.inventoryManaged
  );
  const summary = locationSummaryLine(product);
  const productHref = `/product/${product.slug}`;

  return (
    <article className="product-card group flex h-full flex-col overflow-hidden">
      <Link
        href={productHref}
        className="relative block overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-[var(--surface-elevated)]">
          {product.cover_image_url ? (
            <Image
              src={product.cover_image_url}
              alt={`${product.title}${resolvedGame ? ` — ${resolvedGame}` : ""}`}
              fill
              sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 240px"
              quality={PRODUCT_IMAGE_QUALITY}
              className="object-cover transition duration-200 ease-out group-hover:scale-[1.02] motion-reduce:transform-none"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-700/40 to-slate-800 text-[10px] text-slate-500 sm:text-xs">
              No preview
            </div>
          )}

          <div
            className="absolute inset-0 bg-gradient-to-t from-[#0f172a]/60 via-transparent to-transparent"
            aria-hidden
          />

          {badges.length > 0 && (
            <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1 sm:left-2 sm:top-2">
              {badges.map((badge) => (
                <span
                  key={badge}
                  className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide sm:rounded-md sm:px-2 sm:text-[10px] ${BADGE_STYLES[badge]}`}
                >
                  {badge === "SOLD_OUT" ? "Sold" : badge}
                </span>
              ))}
            </div>
          )}

          {stockDisplay.showOutOfStockOverlay ? (
            <div className="absolute inset-0 bg-slate-950/35" aria-hidden />
          ) : null}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-2 sm:p-4">
        {resolvedGame && (
          <span className="inline-flex max-w-full truncate rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-300 ring-1 ring-blue-500/20 sm:px-2 sm:text-[10px]">
            {resolvedGame}
          </span>
        )}

        <Link href={productHref} className="mt-1 block sm:mt-2">
          <h3 className="line-clamp-2 text-[11px] font-semibold leading-snug text-slate-100 transition duration-200 group-hover:text-white sm:text-sm md:text-base">
            {product.title}
          </h3>
        </Link>

        {summary && (
          <p className="mt-1 hidden text-xs font-medium text-slate-400 sm:block">
            {summary}
          </p>
        )}

        <div className="mt-auto pt-2 sm:pt-4">
          <p className="text-sm font-bold tracking-tight text-white sm:text-xl md:text-2xl">
            {formatPrice(Number(product.price), product.currency)}
          </p>

          <span
            className={`mt-1 inline-flex max-w-full truncate rounded-full px-1.5 py-0.5 text-[9px] font-medium ring-1 sm:mt-2 sm:px-2.5 sm:py-1 sm:text-[11px] ${STOCK_BADGE_STYLES[stockDisplay.level]}`}
          >
            {stockDisplay.label}
          </span>

          <Link
            href={productHref}
            className="mt-2 hidden min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition duration-200 hover:bg-blue-500 sm:mt-4 sm:inline-flex"
          >
            View Account
            <ArrowRightIcon className="h-4 w-4 transition duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none" />
          </Link>
        </div>
      </div>
    </article>
  );
}
