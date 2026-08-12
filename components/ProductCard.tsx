import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/config";
import PurchaseButtons from "@/components/PurchaseButtons";
import type { Product } from "@/lib/types";

type ProductCardProps = {
  product: Product & { games?: { name?: string; slug?: string } | null };
  gameName?: string;
};

export default function ProductCard({ product, gameName }: ProductCardProps) {
  const isAvailable = product.status === "available";
  const resolvedGame = gameName || product.games?.name || null;

  return (
    <article className="card-hover group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/60">
      <Link
        href={`/product/${product.slug}`}
        className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-slate-800">
          {product.cover_image_url ? (
            <Image
              src={product.cover_image_url}
              alt={product.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover transition duration-300 group-hover:scale-[1.03]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 text-xs text-slate-500">
              No preview
            </div>
          )}

          <div className="absolute left-3 top-3">
            {isAvailable ? (
              <span className="rounded-full bg-emerald-500/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                Available
              </span>
            ) : (
              <span className="rounded-full bg-slate-900/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                Sold
              </span>
            )}
          </div>

          {!isAvailable && (
            <div className="absolute inset-0 bg-slate-950/40" aria-hidden />
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        {resolvedGame && (
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-blue-400/90">
            {resolvedGame}
          </p>
        )}

        <Link href={`/product/${product.slug}`}>
          <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-slate-100 transition group-hover:text-white sm:text-[15px]">
            {product.title}
          </h3>
        </Link>

        {(product.server || product.ar_level != null) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] text-slate-400">
            {product.server && (
              <span className="rounded-md border border-slate-700/80 px-2 py-0.5">
                {product.server}
              </span>
            )}
            {product.ar_level != null && (
              <span className="rounded-md border border-slate-700/80 px-2 py-0.5">
                AR {product.ar_level}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto space-y-3 pt-4">
          <p className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            {formatPrice(Number(product.price), product.currency)}
          </p>

          {isAvailable ? (
            <PurchaseButtons
              product={product}
              gameName={resolvedGame}
              available
              layout="stack"
              size="sm"
            />
          ) : (
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/80 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
              Sold
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
