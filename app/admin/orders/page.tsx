"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatPrice, ORDER_STATUSES } from "@/lib/config";
import { toUserError } from "@/lib/errors";

type Order = {
  id: string;
  order_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_whatsapp: string | null;
  status: string | null;
  order_status: string | null;
  total_amount: number | null;
  total: number | null;
  currency: string | null;
  payment_method: string | null;
  payment_status: string | null;
  customer_note: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type OrderItem = {
  order_id: string;
  product_title: string;
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, string[]>>({});
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  async function loadOrders() {
    setLoading(true);
    setError("");

    const { data, error: ordersError } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: sortDir === "asc" });

    if (ordersError) {
      setError(toUserError(ordersError.message));
      setLoading(false);
      return;
    }

      const list = (data || []) as Order[];
    setOrders(list);

    const counts: Record<string, number> = {};
    for (const order of list) {
      const key = order.customer_id || order.customer_email || order.id;
      counts[key] = (counts[key] || 0) + 1;
    }
    setOrderCounts(counts);

    if (list.length > 0) {
      const { data: items } = await supabase
        .from("order_items")
        .select("order_id, product_title")
        .in(
          "order_id",
          list.map((order) => order.id)
        );

      const map: Record<string, string[]> = {};
      for (const item of (items || []) as OrderItem[]) {
        if (!map[item.order_id]) map[item.order_id] = [];
        map[item.order_id].push(item.product_title);
      }
      setItemsByOrder(map);
    } else {
      setItemsByOrder({});
    }

    setLoading(false);
  }

  useEffect(() => {
    let active = true;

    async function run() {
      await loadOrders();
      if (!active) return;
    }

    run();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortDir]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return orders.filter((order) => {
      const status = (order.order_status || order.status || "pending").toLowerCase();

      if (statusFilter !== "all" && status !== statusFilter) {
        return false;
      }

      if (!query) return true;

      const products = (itemsByOrder[order.id] || []).join(" ").toLowerCase();

      return (
        order.id.toLowerCase().includes(query) ||
        (order.order_number || "").toLowerCase().includes(query) ||
        (order.customer_name || "").toLowerCase().includes(query) ||
        (order.customer_email || "").toLowerCase().includes(query) ||
        (order.customer_whatsapp || "").toLowerCase().includes(query) ||
        products.includes(query)
      );
    });
  }, [orders, search, statusFilter, itemsByOrder]);

  function statusClass(status: string | null) {
    switch (status) {
      case "completed":
        return "bg-green-950 text-green-400 border-green-900";
      case "processing":
      case "paid":
        return "bg-blue-950 text-blue-400 border-blue-900";
      case "cancelled":
        return "bg-red-950 text-red-400 border-red-900";
      default:
        return "bg-yellow-950 text-yellow-400 border-yellow-900";
    }
  }

  function paymentClass(status: string | null) {
    if (status === "paid") {
      return "bg-green-950 text-green-400 border-green-900";
    }
    if (status === "failed" || status === "refunded") {
      return "bg-red-950 text-red-400 border-red-900";
    }
    return "bg-yellow-950 text-yellow-400 border-yellow-900";
  }

  function formatDate(date: string | null) {
    if (!date) return "-";
    return new Date(date).toLocaleString("en-MY", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function amount(order: Order) {
    return Number(order.total_amount ?? order.total ?? 0);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <div className="mx-auto max-w-7xl">Loading orders...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/admin"
              className="text-sm text-slate-400 hover:text-white"
            >
              ← Back to Admin
            </Link>
            <h1 className="mt-4 text-3xl font-bold">Orders</h1>
            <p className="mt-2 text-slate-400">
              Manage customer orders and payments.
            </p>
          </div>

          <button
            type="button"
            onClick={loadOrders}
            className="rounded-xl border border-slate-700 px-5 py-3 text-sm hover:border-blue-500"
          >
            Refresh
          </button>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search order ID, email, WhatsApp, product..."
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 outline-none focus:border-blue-500"
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
          >
            <option value="all">All statuses</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            value={sortDir}
            onChange={(event) =>
              setSortDir(event.target.value === "asc" ? "asc" : "desc")
            }
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>

        {error && (
          <div className="mt-8 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-5xl">📦</div>
              <h2 className="mt-4 text-xl font-semibold">No orders found</h2>
              <p className="mt-2 text-sm text-slate-400">
                Try a different search or status filter.
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-800 lg:hidden">
                {filtered.map((order) => {
                  const status = order.order_status || order.status || "pending";
                  const products = itemsByOrder[order.id] || [];

                  return (
                    <div key={order.id} className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs text-slate-300">
                            {order.order_number || order.id.slice(0, 8)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatDate(order.created_at)}
                          </p>
                        </div>
                        <p className="shrink-0 font-semibold">
                          {formatPrice(amount(order), order.currency || "MYR")}
                        </p>
                      </div>

                      <div>
                        <p className="font-medium">{order.customer_name || "-"}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {order.customer_email || "-"}
                        </p>
                        {order.customer_whatsapp && (
                          <p className="mt-1 text-xs text-green-400">{order.customer_whatsapp}</p>
                        )}
                      </div>

                      <p className="text-sm text-slate-300">
                        {products.length > 0 ? products.join(", ") : "-"}
                      </p>

                      <div className="flex flex-wrap gap-2">
                        <span
                          className={
                            "inline-flex rounded-lg border px-2.5 py-1 text-xs font-medium " +
                            (order.customer_id
                              ? "border-blue-900 bg-blue-950 text-blue-400"
                              : "border-slate-700 bg-slate-950 text-slate-400")
                          }
                        >
                          {order.customer_id ? "Registered" : "Guest"}
                        </span>
                        <span
                          className={
                            "inline-flex rounded-lg border px-2.5 py-1 text-xs font-medium " +
                            paymentClass(order.payment_status)
                          }
                        >
                          {order.payment_status || "pending"}
                        </span>
                        <span
                          className={
                            "inline-flex rounded-lg border px-2.5 py-1 text-xs font-medium capitalize " +
                            statusClass(status)
                          }
                        >
                          {status}
                        </span>
                      </div>

                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="inline-flex rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-blue-500"
                      >
                        View order
                      </Link>
                    </div>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="border-b border-slate-800 bg-slate-950">
                  <tr>
                    <th className="px-5 py-4 font-medium text-slate-400">
                      Order ID
                    </th>
                    <th className="px-5 py-4 font-medium text-slate-400">
                      Date
                    </th>
                    <th className="px-5 py-4 font-medium text-slate-400">
                      Customer
                    </th>
                    <th className="px-5 py-4 font-medium text-slate-400">
                      Type
                    </th>
                    <th className="px-5 py-4 font-medium text-slate-400">
                      Product
                    </th>
                    <th className="px-5 py-4 font-medium text-slate-400">
                      Amount
                    </th>
                    <th className="px-5 py-4 font-medium text-slate-400">
                      Payment
                    </th>
                    <th className="px-5 py-4 font-medium text-slate-400">
                      Status
                    </th>
                    <th className="px-5 py-4 font-medium text-slate-400">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800">
                  {filtered.map((order) => {
                    const status = order.order_status || order.status || "pending";
                    const products = itemsByOrder[order.id] || [];

                    return (
                      <tr key={order.id} className="hover:bg-slate-800/40">
                        <td className="px-5 py-5">
                          <div className="font-mono text-xs text-slate-300">
                            {order.order_number || order.id.slice(0, 8)}
                          </div>
                        </td>

                        <td className="whitespace-nowrap px-5 py-5 text-slate-400">
                          {formatDate(order.created_at)}
                        </td>

                        <td className="px-5 py-5">
                          <div className="font-medium">
                            {order.customer_name || "-"}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {order.customer_email || "-"}
                          </div>
                          {order.customer_whatsapp && (
                            <div className="mt-1 text-xs text-green-400">
                              {order.customer_whatsapp}
                            </div>
                          )}
                          {order.customer_id && (
                            <div className="mt-1 font-mono text-[10px] text-slate-600">
                              {order.customer_id.slice(0, 8)}…
                            </div>
                          )}
                          <div className="mt-1 text-[10px] text-slate-500">
                            Orders:{" "}
                            {orderCounts[
                              order.customer_id ||
                                order.customer_email ||
                                order.id
                            ] || 1}
                          </div>
                        </td>

                        <td className="px-5 py-5">
                          <span
                            className={
                              "inline-flex rounded-lg border px-3 py-1 text-xs font-medium " +
                              (order.customer_id
                                ? "border-blue-900 bg-blue-950 text-blue-400"
                                : "border-slate-700 bg-slate-950 text-slate-400")
                            }
                          >
                            {order.customer_id ? "Registered" : "Guest"}
                          </span>
                        </td>

                        <td className="px-5 py-5 text-slate-300">
                          {products.length > 0
                            ? products.join(", ")
                            : "-"}
                        </td>

                        <td className="px-5 py-5 font-semibold">
                          {formatPrice(amount(order), order.currency || "MYR")}
                        </td>

                        <td className="px-5 py-5">
                          <span
                            className={
                              "inline-flex rounded-lg border px-3 py-1 text-xs font-medium " +
                              paymentClass(order.payment_status)
                            }
                          >
                            {order.payment_status || "pending"}
                          </span>
                        </td>

                        <td className="px-5 py-5">
                          <span
                            className={
                              "inline-flex rounded-lg border px-3 py-1 text-xs font-medium capitalize " +
                              statusClass(status)
                            }
                          >
                            {status}
                          </span>
                        </td>

                        <td className="px-5 py-5">
                          <Link
                            href={`/admin/orders/${order.id}`}
                            className="rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-blue-500"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
