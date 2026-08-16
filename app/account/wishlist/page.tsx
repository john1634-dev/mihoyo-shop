"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import AccountGuard from "@/components/AccountGuard";
import Navbar from "@/components/Navbar";
import { getAccessToken } from "@/lib/auth";
import { formatPrice } from "@/lib/config";

type WishlistItem = {
  product_id: string;
  created_at: string;
  products: {
    id: string;
    title: string;
    slug: string;
    price: number;
    currency: string;
    status: string;
    cover_image_url: string | null;
  } | null;
};

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function remove(productId: string) {
    const token = await getAccessToken();

    await fetch("/api/wishlist", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        product_id: productId,
      }),
    });

    setItems((prev) =>
      prev.filter((item) => item.product_id !== productId)
    );
  }

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        const token = await getAccessToken();

        const res = await fetch("/api/wishlist", {
          headers: token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {},
        });

        if (!active) {
          return;
        }

        if (res.ok) {
          const data = (await res.json()) as {
            wishlist: WishlistItem[];
          };

          setItems(data.wishlist ?? []);
        }
      } catch {
        // Ignore wishlist loading errors here.
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, []);

  return (
    <AccountGuard>
      <main className="storefront-main flex min-h-screen flex-col">
        <Navbar />

        <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 md:px-6">
          <h1 className="text-3xl font-bold">My Wishlist</h1>
          <p className="mt-2 text-[var(--muted)]">Products you saved for later</p>

          {loading ? (
            <p className="mt-10 text-[var(--muted)]">Loading...</p>
          ) : items.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-card)] p-12 text-center">
              <p className="text-[var(--muted)]">Your wishlist is empty.</p>

              <Link
                href="/products"
                className="mt-4 inline-block text-[var(--accent-strong)] hover:text-[var(--accent)]"
              >
                Browse products →
              </Link>
            </div>
          ) : (
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const product = item.products;

                if (!product) {
                  return null;
                }

                const isSold = product.status === "sold";

                return (
                  <div
                    key={item.product_id}
                    className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-card)]"
                  >
                    <div className="relative aspect-square bg-[var(--surface-muted)]">
                      {product.cover_image_url ? (
                        <Image
                          src={product.cover_image_url}
                          alt={product.title}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-4xl">
                          🎮
                        </div>
                      )}

                      {isSold && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                          <span className="rounded-full bg-red-900/80 px-3 py-1 text-sm font-semibold text-red-300">
                            Sold
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-4">
                      <p className="line-clamp-2 font-semibold text-[var(--foreground)]">
                        {product.title}
                      </p>

                      <p className="mt-1 font-semibold text-[var(--accent-strong)]">
                        {formatPrice(product.price, product.currency)}
                      </p>

                      <div className="mt-3 flex gap-2">
                        {!isSold && (
                          <Link
                            href={`/product/${product.slug}`}
                            className="btn-primary flex-1 px-3 py-2 text-center text-sm"
                          >
                            View
                          </Link>
                        )}

                        <button
                          type="button"
                          onClick={() => remove(item.product_id)}
                          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:border-red-700 hover:text-red-400"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>
    </AccountGuard>
  );
}