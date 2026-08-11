"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import AccountGuard from "@/components/AccountGuard";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
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
      <main className="flex min-h-screen flex-col bg-slate-950 text-white">
        <Navbar />

        <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 md:px-6">
          <h1 className="text-3xl font-bold">My Wishlist</h1>
          <p className="mt-2 text-slate-400">Products you saved for later</p>

          {loading ? (
            <p className="mt-10 text-slate-400">Loading...</p>
          ) : items.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center">
              <p className="text-slate-400">Your wishlist is empty.</p>

              <Link
                href="/products"
                className="mt-4 inline-block text-blue-400 hover:text-blue-300"
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
                    className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"
                  >
                    <div className="relative aspect-square bg-slate-800">
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
                      <p className="line-clamp-2 font-semibold text-white">
                        {product.title}
                      </p>

                      <p className="mt-1 font-semibold text-blue-400">
                        {formatPrice(product.price, product.currency)}
                      </p>

                      <div className="mt-3 flex gap-2">
                        {!isSold && (
                          <Link
                            href={`/product/${product.slug}`}
                            className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-center text-sm font-semibold hover:bg-blue-500"
                          >
                            View
                          </Link>
                        )}

                        <button
                          type="button"
                          onClick={() => remove(item.product_id)}
                          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400 hover:border-red-700 hover:text-red-400"
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

        <Footer />
      </main>
    </AccountGuard>
  );
}