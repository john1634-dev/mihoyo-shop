import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/config";
import { getProductBadges, type ProductBadge } from "@/lib/products-public";
import { ArrowRightIcon } from "@/components/icons";
import type { Product } from "@/lib/types";

const PRODUCT_IMAGE_QUALITY = 88;

const BADGE_STYLES: Record<ProductBadge, string> = {
  NEW: "bg-blue-600/90 text-white",
  SOLD_OUT: "bg-slate-950/90 text-slate-300",
};

function accountSummaryLine(product: Product): string | null {
  const parts: string[] = [];
  if (product.ar_level != null) parts.push(`AR ${product.ar_level}`);
  if (product.server?.trim()) parts.push(product.server.trim());
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
}: ProductCardProps) {
  const isAvailable = product.status === "available";
  const resolvedGame = resolveGameName(product, gameName, gameNameById);
  const badges = getProductBadges(product);
  const summary = accountSummaryLine(product);
  const preview = descriptionPreview(product.description);
  const productHref = `/product/${product.slug}`;

  return (
    <article className="product-card group flex h-full flex-col">
      <Link
        href={productHref}
        className="relative block overflow-hidden rounded-t-xl border border-b-0 border-white/[0.08] bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:rounded-t-2xl"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-slate-800">
          {product.cover_image_url ? (
            <Image
              src={product.cover_image_url}
              alt={`${product.title}${resolvedGame ? ` — ${resolvedGame}` : ""}`}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px"
              quality={PRODUCT_IMAGE_QUALITY}
              className="object-cover transition duration-200 ease-out group-hover:scale-[1.02] motion-reduce:transform-none"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 text-xs text-slate-500">
              No preview
            </div>
          )}

          <div
            className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/15 to-transparent"
            aria-hidden
          />

          <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1 sm:left-3 sm:top-3">
            {badges.map((badge) => (
              <span
                key={badge}
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${BADGE_STYLES[badge]}`}
              >
                {badge === "SOLD_OUT" ? "Sold Out" : badge}
              </span>
            ))}
          </div>

          {!isAvailable && (
            <div className="absolute inset-0 bg-slate-950/50" aria-hidden />
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col rounded-b-xl border border-white/[0.08] border-t-0 bg-slate-900/50 p-3 sm:rounded-b-2xl sm:p-4">
        {resolvedGame && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:text-[11px]">
            {resolvedGame}
          </p>
        )}

        <Link href={productHref} className="mt-1 block">
          <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-100 transition duration-200 group-hover:text-white sm:text-[15px]">
            {product.title}
          </h3>
        </Link>

        {summary && (
          <p className="mt-2 text-[11px] font-medium text-slate-400 sm:text-xs">
            {summary}
          </p>
        )}

        {preview && (
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500 sm:text-xs">
            {preview}
          </p>
        )}

        <div className="mt-auto pt-3 sm:pt-4">
          <p className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            {formatPrice(Number(product.price), product.currency)}
          </p>

          <Link
            href={productHref}
            className="mt-3 inline-flex min-h-[2.25rem] w-full items-center justify-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-xs font-semibold text-blue-300 transition duration-200 hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-200 sm:min-h-[2.5rem] sm:text-sm"
          >
            View details &amp; buy
            <ArrowRightIcon className="h-3.5 w-3.5 transition duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none sm:h-4 sm:w-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}
