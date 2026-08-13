import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/config";
import { getRegionLabel, normalizeRegionCode } from "@/lib/catalog-meta";
import { getProductBadges, type ProductBadge } from "@/lib/products-public";
import {
  customerStockLabel,
  stockLevelFromAvailable,
} from "@/lib/inventory-stock";
import { ArrowRightIcon } from "@/components/icons";
import type { Product } from "@/lib/types";

const PRODUCT_IMAGE_QUALITY = 88;

const BADGE_STYLES: Record<ProductBadge, string> = {
  NEW: "bg-blue-600/90 text-white",
  SOLD_OUT: "bg-slate-800/90 text-slate-300",
};

const STOCK_BADGE_STYLES = {
  in_stock: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25",
  low_stock: "bg-amber-500/10 text-amber-300 ring-amber-500/25",
  out_of_stock: "bg-slate-700/80 text-slate-400 ring-slate-600/40",
} as const;

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

function descriptionPreview(description: string | null | undefined): string | null {
  const line = description?.trim().split("\n").find(Boolean);
  if (!line) return null;
  return line.length > 72 ? `${line.slice(0, 69)}…` : line;
}

type ProductCardProps = {
  product: Product & { games?: { name?: string; slug?: string } | null };
  gameName?: string;
  gameNameById?: Map<string, string>;
  availableStock?: number;
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

export default function ProductCard({
  product,
  gameName,
  gameNameById,
  availableStock,
}: ProductCardProps) {
  const isListed = product.status === "available";
  const stockCount = availableStock ?? (isListed ? 1 : 0);
  const resolvedGame = resolveGameName(product, gameName, gameNameById);
  const badges = getProductBadges(product, stockCount);
  const stockLabel = customerStockLabel({
    productStatus: product.status,
    availableCount: stockCount,
  });
  const stockLevel = stockLevelFromAvailable(stockCount);
  const summary = locationSummaryLine(product);
  const preview = descriptionPreview(product.description);
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
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px"
              quality={PRODUCT_IMAGE_QUALITY}
              className="object-cover transition duration-200 ease-out group-hover:scale-[1.02] motion-reduce:transform-none"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-700/40 to-slate-800 text-xs text-slate-500">
              No preview
            </div>
          )}

          <div
            className="absolute inset-0 bg-gradient-to-t from-[#0f172a]/70 via-transparent to-transparent"
            aria-hidden
          />

          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {badges.map((badge) => (
              <span
                key={badge}
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${BADGE_STYLES[badge]}`}
              >
                {badge === "SOLD_OUT" ? "Sold Out" : badge}
              </span>
            ))}
          </div>

          {!isListed || stockCount <= 0 ? (
            <div className="absolute inset-0 bg-slate-950/35" aria-hidden />
          ) : null}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        {resolvedGame && (
          <span className="inline-flex w-fit max-w-full truncate rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-300 ring-1 ring-blue-500/20">
            {resolvedGame}
          </span>
        )}

        <Link href={productHref} className="mt-2 block">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-100 transition duration-200 group-hover:text-white sm:text-base">
            {product.title}
          </h3>
        </Link>

        {summary && (
          <p className="mt-2 text-xs font-medium text-slate-400">{summary}</p>
        )}

        {preview && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
            {preview}
          </p>
        )}

        <div className="mt-auto pt-4">
          <p className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            {formatPrice(Number(product.price), product.currency)}
          </p>

          <span
            className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${STOCK_BADGE_STYLES[stockLevel]}`}
          >
            {stockLabel}
          </span>

          <Link
            href={productHref}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition duration-200 hover:bg-blue-500"
          >
            View Account
            <ArrowRightIcon className="h-4 w-4 transition duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none" />
          </Link>
        </div>
      </div>
    </article>
  );
}
