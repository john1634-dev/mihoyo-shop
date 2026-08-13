"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import { buildWhatsAppUrl, formatPrice } from "@/lib/config";
import { getAccessToken } from "@/lib/auth";

type OrderView = {
  order_id: string;
  order_number: string | null;
  status: string;
  status_label: string;
  payment_status: string | null;
  currency: string;
  amount: number;
  created_at: string;
  items: Array<{ title: string; price: number; currency: string; quantity: number }>;
};

export default function CheckoutSuccessClient() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id") || "";
  const token = searchParams.get("t") || "";
  const sessionId = searchParams.get("session_id") || "";
  const missingParams = !orderId || !token;

  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState(
    missingParams ? "Missing order receipt details." : ""
  );
  const [loading, setLoading] = useState(!missingParams);

  useEffect(() => {
    if (missingParams) return;

    let active = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      attempts += 1;
      try {
        const authToken = await getAccessToken();
        const qs = new URLSearchParams({
          t: token,
          ...(sessionId ? { session_id: sessionId } : {}),
        });
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}?${qs}`, {
          cache: "no-store",
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Order not found.");
        }
        if (!active) return;
        setOrder(data as OrderView);
        setError("");
        setLoading(false);

        if (data.status === "pending" && attempts < 8) {
          timer = setTimeout(() => {
            if (active) void load();
          }, 2500);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not load order.");
        setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, token, sessionId, missingParams]);

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <Navbar />
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 md:px-6">
        <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>
        <p className="mt-2 text-slate-400">
          This page does not confirm payment by itself. We verify payment with
          Stripe, then source the account manually.
        </p>

        {loading && (
          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <p className="text-sm text-slate-300">Checking order status…</p>
          </div>
        )}

        {error && !loading && (
          <div className="mt-8 rounded-2xl border border-red-900/50 bg-red-950/30 p-6 text-sm text-red-200">
            {error}
          </div>
        )}

        {order && !loading && (
          <div className="mt-8 space-y-5">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Status
              </p>
              <p className="mt-2 text-2xl font-semibold">{order.status_label}</p>
              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Order</dt>
                  <dd className="mt-1 font-medium">
                    {order.order_number || order.order_id}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Amount</dt>
                  <dd className="mt-1 font-medium">
                    {formatPrice(order.amount, order.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Payment</dt>
                  <dd className="mt-1 font-medium capitalize">
                    {order.payment_status || "pending"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Created</dt>
                  <dd className="mt-1 font-medium">
                    {new Date(order.created_at).toLocaleString("en-MY")}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-lg font-semibold">Items</h2>
              <ul className="mt-4 space-y-3 text-sm">
                {order.items.map((item, index) => (
                  <li
                    key={`${item.title}-${index}`}
                    className="flex items-start justify-between gap-3"
                  >
                    <span className="text-slate-200">{item.title}</span>
                    <span className="shrink-0 text-slate-300">
                      {formatPrice(item.price, item.currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-xs leading-relaxed text-slate-500">
                Account details are never shown here. After payment is confirmed
                we source and verify the account, then deliver it manually via
                WhatsApp or email.
              </p>
            </section>

            <div className="flex flex-wrap gap-3">
              <Link href="/products" className="btn-secondary">
                Browse accounts
              </Link>
              <a
                href={buildWhatsAppUrl(
                  `Hi, I just placed order ${order.order_number || order.order_id}. Can you confirm status?`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-whatsapp"
              >
                WhatsApp support
              </a>
              <Link href="/account/orders" className="btn-primary">
                My orders
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
