import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/config";
import type { Product } from "@/lib/types";

type ProductCardProps = {
  product: Product & { games?: { name?: string; slug?: string } | null };
  gameName?: string;
};

export default function ProductCard({ product, gameName }: ProductCardProps) {
  const isAvailable = product.status === "available";
  const resolvedGame =
    gameName || product.games?.name || null;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 transition duration-200 hover:border-blue-500/50 hover:bg-slate-900">
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
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 text-sm text-slate-500">
              No image
            </div>
          )}

          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            {isAvailable ? (
              <span className="rounded-md bg-emerald-500/90 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                Available
              </span>
            ) : (
              <span className="rounded-md bg-red-500/90 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                Sold
              </span>
            )}
          </div>

          {!isAvailable && (
            <div className="absolute inset-0 bg-black/45" aria-hidden="true" />
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        {resolvedGame && (
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-blue-400/90">
            {resolvedGame}
          </p>
        )}

        <Link href={`/product/${product.slug}`}>
          <h3 className="line-clamp-2 min-h-[2.75rem] text-sm font-semibold leading-snug text-slate-50 transition group-hover:text-white sm:text-base">
            {product.title}
          </h3>
        </Link>

        <div className="mt-3 flex min-h-[1.25rem] flex-wrap gap-2 text-xs text-slate-400">
          {product.server && (
            <span className="rounded-md border border-slate-700 px-2 py-0.5">
              {product.server}
            </span>
          )}
          {product.ar_level != null && (
            <span className="rounded-md border border-slate-700 px-2 py-0.5">
              AR {product.ar_level}
            </span>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <span className="text-lg font-bold tracking-tight sm:text-xl">
            {formatPrice(Number(product.price), product.currency)}
          </span>

          {isAvailable ? (
            <Link
              href={`/product/${product.slug}`}
              className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium transition hover:bg-blue-500"
            >
              View
            </Link>
          ) : (
            <span className="rounded-lg bg-slate-800 px-3.5 py-2 text-sm text-slate-500">
              Sold out
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
