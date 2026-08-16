"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AccountGuard from "@/components/AccountGuard";
import Navbar from "@/components/Navbar";
import { getAccessToken } from "@/lib/auth";
import { formatPrice } from "@/lib/config";
import { customerFacingStatusLabel, normalizeOrderStatus } from "@/lib/orders";

type AccountOrder = {
  id: string;
  order_number: string | null;
  status: string;
  payment_status: string | null;
  currency: string;
  amount: number;
  created_at: string;
  items: Array<{ title: string }>;
};

export default function AccountOrdersPage() {
  return (
    <AccountGuard>
      <AccountOrdersContent />
    </AccountGuard>
  );
}

function AccountOrdersContent() {
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const token = await getAccessToken();
        if (!token) {
          throw new Error("Please log in to view orders.");
        }

        const res = await fetch("/api/account/orders", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Failed to load orders.");
        }
        if (active) {
          setOrders(data.orders || []);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load orders.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="storefront-main flex min-h-screen flex-col">
      <Navbar />
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Orders</h1>
            <p className="mt-2 text-[var(--muted)]">
              Payment and sourcing status for your purchases. Credentials are
              never shown here.
            </p>
          </div>
          <Link href="/account" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
            ← Account
          </Link>
        </div>

        {loading && (
          <div className="mt-8 animate-pulse space-y-3">
            <div className="h-24 rounded-2xl bg-[var(--surface-muted)]" />
            <div className="h-24 rounded-2xl bg-[var(--surface-muted)]" />
          </div>
        )}

        {error && (
          <div className="mt-8 rounded-2xl border border-red-900/40 bg-red-950/20 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {!loading && !error && orders.length === 0 && (
          <div className="mt-8 rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-card)]/70 p-8 text-center">
            <p className="text-[var(--muted-strong)]">No card checkout orders yet.</p>
            <Link href="/products" className="btn-primary mt-5 inline-flex">
              Browse accounts
            </Link>
          </div>
        )}

        <div className="mt-8 space-y-4">
          {orders.map((order) => {
            const status = normalizeOrderStatus(order);
            return (
              <article
                key={order.id}
                className="rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-card)]/70 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {order.order_number || order.id.slice(0, 8)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {new Date(order.created_at).toLocaleString("en-MY")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {customerFacingStatusLabel(status)}
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted-strong)]">
                      {formatPrice(order.amount, order.currency)}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-[var(--muted-strong)]">
                  {order.items.map((i) => i.title).join(", ") || "Account listing"}
                </p>
                <p className="mt-2 text-xs capitalize text-[var(--muted)]">
                  Payment: {order.payment_status || "pending"}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
