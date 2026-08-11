import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/config";
import type { Product } from "@/lib/types";

type ProductCardProps = {
  product: Product;
};

export default function ProductCard({ product }: ProductCardProps) {
  const isAvailable = product.status === "available";

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 transition hover:border-blue-500/60">
      <Link href={`/product/${product.slug}`} className="block">
        <div className="relative aspect-[4/3] bg-slate-800">
          {product.cover_image_url ? (
            <Image
              src={product.cover_image_url}
              alt={product.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-5xl">
              🎮
            </div>
          )}

          {!isAvailable && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <span className="rounded-full bg-red-500/90 px-4 py-1 text-sm font-semibold uppercase tracking-wide">
                Sold Out
              </span>
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <Link href={`/product/${product.slug}`}>
          <h3 className="line-clamp-2 min-h-[3rem] font-semibold leading-snug">
            {product.title}
          </h3>
        </Link>

        <div className="mt-3 flex min-h-[1.25rem] flex-wrap gap-2 text-xs text-slate-400">
          {product.server && <span>{product.server}</span>}
          {product.ar_level != null && <span>AR {product.ar_level}</span>}
        </div>

        <div className="mt-auto flex items-center justify-between pt-5">
          <span className="text-xl font-bold">
            {formatPrice(Number(product.price), product.currency)}
          </span>

          {isAvailable ? (
            <Link
              href={`/product/${product.slug}`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500"
            >
              View
            </Link>
          ) : (
            <span className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-500">
              Unavailable
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
