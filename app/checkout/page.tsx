"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { clearCart, getCartTotal, loadCart } from "@/lib/cart";
import {
  formatPrice,
  SITE_NAME,
} from "@/lib/config";
import { getAccessToken } from "@/lib/auth";
import { toUserError } from "@/lib/errors";
import {
  isValidEmail,
  isValidPhone,
  sanitizeText,
} from "@/lib/validation";
import type { CartItem } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function CheckoutPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [customerNote, setCustomerNote] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Coupon
  const [couponInput, setCouponInput] = useState("");
  const [couponApplied, setCouponApplied] = useState<{
    code: string; discount_amount: number; discount_type: string; discount_value: number;
  } | null>(null);
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (!active) return;
      setItems(loadCart());
      setLoaded(true);
    });

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user);
      if (data.user?.email) {
        setCustomerEmail(data.user.email);
      }
      const metaName = data.user?.user_metadata?.full_name;
      if (typeof metaName === "string" && metaName.trim()) {
        setCustomerName(metaName.trim());
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const subtotal = getCartTotal(items);
  const discount = couponApplied?.discount_amount ?? 0;
  const total = Math.max(0, subtotal - discount);
  const isLoggedIn = Boolean(user);

  async function applyCoupon() {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    setCouponError("");
    setCouponApplied(null);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/coupon/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code: couponInput.trim(), subtotal }),
      });
      const data = await res.json() as { valid?: boolean; discount_amount?: number; code?: string; discount_type?: string; discount_value?: number; reason?: string };
      if (data.valid) {
        setCouponApplied({ code: data.code!, discount_amount: data.discount_amount!, discount_type: data.discount_type!, discount_value: data.discount_value! });
      } else {
        setCouponError(data.reason ?? "Invalid coupon.");
      }
    } catch {
      setCouponError("Could not validate coupon. Please try again.");
    }
    setCouponLoading(false);
  }

  function removeCoupon() {
    setCouponApplied(null);
    setCouponInput("");
    setCouponError("");
  }

  async function placeOrder(event: FormEvent) {
    event.preventDefault();

    if (items.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    const name = sanitizeText(customerName, 120);
    const email = isLoggedIn
      ? user?.email || ""
      : sanitizeText(customerEmail, 200);
    const whatsapp = sanitizeText(customerWhatsapp, 30);
    const note = sanitizeText(customerNote, 1000);

    if (name.length < 2) {
      setError("Please enter your full name.");
      return;
    }

    if (!isLoggedIn && !isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!isValidPhone(whatsapp)) {
      setError("Please enter a valid WhatsApp number.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const token = await getAccessToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers,
        body: JSON.stringify({
          customerName: name,
          customerEmail: isLoggedIn ? undefined : email,
          customerWhatsapp: whatsapp,
          customerNote: note,
          productIds: items.map((item) => item.id),
          couponCode: couponApplied?.code ?? undefined,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(toUserError(payload.error || "Checkout failed"));
        setSubmitting(false);
        return;
      }

      clearCart();
      window.location.href = payload.checkoutUrl;
    } catch {
      setError("We could not complete your order. Please try again.");
      setSubmitting(false);
    }
  }

  if (!loaded) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="mx-auto max-w-6xl px-6 py-12 text-slate-400">
          Loading checkout...
        </div>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="mx-auto max-w-6xl px-6 py-12">
          <Link href="/cart" className="text-sm text-slate-400 hover:text-white">
            ← Back to Cart
          </Link>

          <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center">
            <div className="text-5xl">🛒</div>
            <h1 className="mt-5 text-2xl font-bold">Your cart is empty</h1>
            <p className="mt-2 text-slate-400">
              Add a product before checking out.
            </p>
            <Link
              href="/products"
              className="mt-6 inline-block rounded-xl bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-500"
            >
              Browse Products
            </Link>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <Navbar />

      <div className="mx-auto max-w-6xl px-3 py-8 sm:px-4 sm:py-10 md:px-6 md:py-12">
        <Link href="/cart" className="text-sm text-slate-400 hover:text-white">
          ← Back to Cart
        </Link>

        <h1 className="mt-5 text-2xl font-bold sm:text-3xl">Checkout</h1>
        <p className="mt-2 text-sm text-slate-400">
          Each game account can only be purchased once.
        </p>

        <div className="mt-6 grid gap-6 sm:mt-8 sm:gap-8 lg:grid-cols-3">
          <form onSubmit={placeOrder} className="space-y-4 sm:space-y-6 lg:col-span-2">
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
              <h2 className="text-xl font-semibold">Customer Information</h2>

              <div className="mt-6 space-y-5">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
                    placeholder="Your name"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Email
                  </label>
                  {isLoggedIn ? (
                    <div className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-300">
                      {user?.email}
                      <p className="mt-1 text-xs text-slate-500">
                        Using your account email
                      </p>
                    </div>
                  ) : (
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(event) => setCustomerEmail(event.target.value)}
                      required
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
                      placeholder="you@example.com"
                    />
                  )}
                  {!isLoggedIn && (
                    <p className="mt-2 text-xs text-slate-500">
                      Have an account?{" "}
                      <Link href="/login?next=/checkout" className="text-blue-400">
                        Login
                      </Link>{" "}
                      to track orders, or continue as guest.
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    WhatsApp Number
                  </label>
                  <input
                    type="tel"
                    value={customerWhatsapp}
                    onChange={(event) =>
                      setCustomerWhatsapp(event.target.value)
                    }
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
                    placeholder="0123456789"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Required so {SITE_NAME} can contact you about delivery.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Notes
                  </label>
                  <textarea
                    value={customerNote}
                    onChange={(event) => setCustomerNote(event.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
                    placeholder="Optional notes..."
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
              <h2 className="text-xl font-semibold">Payment Option</h2>
              <div className="mt-6 rounded-xl border border-blue-900 bg-blue-950/30 p-4 text-sm">
                <div className="font-medium text-slate-100">
                  Pay securely with Stripe Checkout
                </div>
                <div className="mt-1 text-slate-400">
                  Cards, Apple Pay, Google Pay, GrabPay, and Link when available
                  for your Stripe account and currency.
                </div>
              </div>
            </section>

            {error && (
              <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-blue-600 px-6 py-4 font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? "Creating order & redirecting..."
                : "Pay with Stripe"}
            </button>
          </form>

          <div>
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
              <h2 className="text-xl font-semibold">Order Summary</h2>

              <div className="mt-6 space-y-4">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex gap-3 border-b border-slate-800 pb-4"
                  >
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-950">
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.title}
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-500">
                          No Image
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-400">Qty: 1</p>
                      <p className="mt-1 text-sm">
                        {formatPrice(Number(item.price), item.currency)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Coupon input */}
              <div className="mt-5 border-t border-slate-800 pt-5">
                {couponApplied ? (
                  <div className="flex items-center justify-between rounded-xl border border-green-800 bg-green-950/30 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-green-400">
                        {couponApplied.code}
                      </p>
                      <p className="text-xs text-green-500">
                        −{formatPrice(couponApplied.discount_amount)} discount
                      </p>
                    </div>
                    <button onClick={removeCoupon} className="text-xs text-slate-400 hover:text-red-400">Remove</button>
                  </div>
                ) : (
                  <div>
                    <p className="mb-2 text-sm text-slate-400">Have a coupon?</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        value={couponInput}
                        onChange={e => setCouponInput(e.target.value.toUpperCase())}
                        onKeyDown={e => e.key === "Enter" && (e.preventDefault(), applyCoupon())}
                        className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono uppercase outline-none focus:border-blue-500"
                        placeholder="COUPON CODE"
                      />
                      <button
                        type="button"
                        onClick={applyCoupon}
                        disabled={couponLoading || !couponInput.trim()}
                        className="shrink-0 rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-600 disabled:opacity-50 sm:self-auto">
                        {couponLoading ? "…" : "Apply"}
                      </button>
                    </div>
                    {couponError && <p className="mt-1 text-xs text-red-400">{couponError}</p>}
                  </div>
                )}
              </div>

              <div className="mt-4 border-t border-slate-800 pt-4 space-y-2">
                <div className="flex justify-between text-sm text-slate-400">
                  <span>Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm text-green-400">
                    <span>Discount</span>
                    <span>−{formatPrice(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-1">
                  <span>Total</span>
                  <span>{formatPrice(total)}</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
