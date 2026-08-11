"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import AccountGuard from "@/components/AccountGuard";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { formatPrice } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { toUserError } from "@/lib/errors";

type OrderRow = {
  id: string;
  order_number: string | null;
  created_at: string | null;
  total_amount: number | null;
  total: number | null;
  currency: string | null;
  status: string | null;
  order_status: string | null;
  payment_status: string | null;
};

type ItemRow = {
  order_id: string;
  product_title: string;
  product_id: string | null;
};

export default function AccountOrdersPage() {
  return (
    <AccountGuard>
      <OrdersContent />
    </AccountGuard>
  );
}

function OrdersContent() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<
    Record<string, { titles: string[]; image?: string | null }>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });

      if (!active) return;

      if (ordersError) {
        setError(toUserError(ordersError.message));
        setLoading(false);
        return;
      }

      const list = (data || []) as OrderRow[];
      setOrders(list);

      if (list.length > 0) {
        const { data: items } = await supabase
          .from("order_items")
          .select("order_id, product_title, product_id")
          .in(
            "order_id",
            list.map((o) => o.id)
          );

        const productIds = Array.from(
          new Set(
            ((items || []) as ItemRow[])
              .map((i) => i.product_id)
              .filter(Boolean) as string[]
          )
        );

        const imageMap: Record<string, string | null> = {};
        if (productIds.length > 0) {
          const { data: products } = await supabase
            .from("products")
            .select("id, cover_image_url")
            .in("id", productIds);

          for (const product of products || []) {
            imageMap[product.id] = product.cover_image_url;
          }
        }

        const map: Record<string, { titles: string[]; image?: string | null }> =
          {};
        for (const item of (items || []) as ItemRow[]) {
          if (!map[item.order_id]) {
            map[item.order_id] = {
              titles: [],
              image: item.product_id ? imageMap[item.product_id] : null,
            };
          }
          map[item.order_id].titles.push(item.product_title);
          if (!map[item.order_id].image && item.product_id) {
            map[item.order_id].image = imageMap[item.product_id];
          }
        }
        setItemsByOrder(map);
      }

      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <Navbar />

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 md:px-6">
        <Link href="/account" className="text-sm text-slate-400 hover:text-white">
          ← Back to Account
        </Link>

        <h1 className="mt-5 text-3xl font-bold">Order History</h1>
        <p className="mt-2 text-slate-400">Orders linked to your account</p>

        {loading && <p className="mt-10 text-slate-400">Loading orders...</p>}

        {error && (
          <div className="mt-10 rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && orders.length === 0 && (
          <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center">
            <div className="text-5xl">📦</div>
            <h2 className="mt-4 text-xl font-semibold">No orders yet</h2>
            <p className="mt-2 text-slate-400">
              When you place an order while logged in, it will appear here.
            </p>
            <Link
              href="/products"
              className="mt-6 inline-block rounded-xl bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-500"
            >
              Browse Products
            </Link>
          </div>
        )}

        {!loading && orders.length > 0 && (
          <div className="mt-10 space-y-4">
            {orders.map((order) => {
              const meta = itemsByOrder[order.id];
              const status = order.order_status || order.status || "pending";
              const total = Number(order.total_amount ?? order.total ?? 0);

              return (
                <Link
                  key={order.id}
                  href={`/account/orders/${order.id}`}
                  className="flex gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 transition hover:border-blue-500"
                >
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-950">
                    {meta?.image ? (
                      <Image
                        src={meta.image}
                        alt={meta.titles[0] || "Order"}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-500">
                        No Image
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-mono text-sm text-blue-300">
                          {order.order_number || order.id.slice(0, 8)}
                        </div>
                        <div className="mt-1 truncate text-sm text-slate-300">
                          {meta?.titles?.join(", ") || "Order items"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">
                          {formatPrice(total, order.currency || "MYR")}
                        </div>
                        <div className="mt-1 text-xs capitalize text-slate-400">
                          {status} · {order.payment_status || "pending"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      {order.created_at
                        ? new Date(order.created_at).toLocaleString("en-MY", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "-"}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}
