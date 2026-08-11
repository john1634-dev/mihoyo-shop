"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import AccountGuard from "@/components/AccountGuard";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { formatPrice } from "@/lib/config";
import { getAccessToken } from "@/lib/auth";
import { toUserError } from "@/lib/errors";
import type { OrderReceipt } from "@/lib/orders";

export default function AccountOrderDetailPage() {
  return (
    <AccountGuard>
      <OrderDetailContent />
    </AccountGuard>
  );
}

function OrderDetailContent() {
  const params = useParams();
  const orderId = params.id as string;

  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      const token = await getAccessToken();
      if (!token) {
        setError("Please log in to view this order.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/orders/${orderId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = await response.json();

        if (!active) return;

        if (!response.ok) {
          setError(toUserError(payload.error || "ORDER_NOT_FOUND"));
          setLoading(false);
          return;
        }

        setReceipt(payload as OrderReceipt);
        setLoading(false);
      } catch {
        if (!active) return;
        setError("We could not load this order.");
        setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [orderId]);

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <Navbar />

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 md:px-6">
        <Link
          href="/account/orders"
          className="text-sm text-slate-400 hover:text-white"
        >
          ← Back to Orders
        </Link>

        <h1 className="mt-5 text-3xl font-bold">Order Details</h1>

        {loading && <p className="mt-10 text-slate-400">Loading order...</p>}

        {error && (
          <div className="mt-10 rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-400">
            {error}
          </div>
        )}

        {receipt && (
          <div className="mt-8 space-y-6">
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="font-mono text-blue-300">
                {receipt.order_number}
              </div>
              <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-xs text-slate-500">Date</div>
                  <div className="mt-1">
                    {receipt.created_at
                      ? new Date(receipt.created_at).toLocaleString("en-MY", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Total</div>
                  <div className="mt-1 font-semibold">
                    {formatPrice(Number(receipt.total || 0), receipt.currency)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Order Status</div>
                  <div className="mt-1 capitalize">{receipt.status}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Payment Status</div>
                  <div className="mt-1 capitalize">{receipt.payment_status}</div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-lg font-semibold">Products</h2>
              <div className="mt-4 space-y-4">
                {(receipt.items || []).map((item, index) => (
                  <div key={`${item.title}-${index}`} className="flex gap-3">
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
                        <div className="flex h-full items-center justify-center text-[10px] text-slate-500">
                          No Image
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{item.title}</div>
                      <div className="mt-1 text-sm text-slate-400">
                        Qty {item.quantity}
                      </div>
                      <div className="mt-1 text-sm">
                        {formatPrice(
                          Number(item.subtotal || item.price),
                          receipt.currency
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}
