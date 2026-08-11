"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { getCartTotal, loadCart, saveCart } from "@/lib/cart";
import { formatPrice } from "@/lib/config";
import type { CartItem } from "@/lib/types";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("cart-updated", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("cart-updated", onStoreChange);
  };
}

function getSnapshot() {
  return JSON.stringify(loadCart());
}

function getServerSnapshot() {
  return "[]";
}

export default function CartPage() {
  const cartJson = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  const items: CartItem[] = JSON.parse(cartJson);

  function removeItem(id: string) {
    saveCart(items.filter((item) => item.id !== id));
  }

  const total = getCartTotal(items);

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <Navbar />

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6">
        <Link
          href="/products"
          className="text-sm text-slate-400 hover:text-white"
        >
          ← Continue Shopping
        </Link>

        <div className="mt-5 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">Shopping Cart</h1>
          <span className="text-sm text-slate-400">
            {items.length} item{items.length === 1 ? "" : "s"}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center">
            <div className="text-5xl">🛒</div>
            <h2 className="mt-5 text-2xl font-semibold">Your cart is empty</h2>
            <p className="mt-2 text-slate-400">
              Add a game account to continue.
            </p>
            <Link
              href="/products"
              className="mt-6 inline-block rounded-xl bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-500"
            >
              Browse Products
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid gap-8 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-4"
                >
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-950 sm:h-28 sm:w-28">
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt={item.title}
                        fill
                        sizes="112px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-500">
                        No Image
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-4">
                      <div className="min-w-0">
                        <h2 className="truncate font-semibold">{item.title}</h2>
                        <p className="mt-1 text-sm text-slate-400">
                          Digital account · Qty 1
                        </p>
                        <p className="mt-2 font-semibold">
                          {formatPrice(Number(item.price), item.currency)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="shrink-0 text-sm text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="text-xl font-semibold">Order Summary</h2>

                <div className="mt-6 flex justify-between text-slate-400">
                  <span>Subtotal</span>
                  <span>{formatPrice(total)}</span>
                </div>

                <div className="mt-4 border-t border-slate-800 pt-4">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span>{formatPrice(total)}</span>
                  </div>
                </div>

                <Link
                  href="/checkout"
                  className="mt-6 block rounded-xl bg-blue-600 px-6 py-3 text-center font-semibold hover:bg-blue-500"
                >
                  Proceed to Checkout
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}
