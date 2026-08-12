"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  formatPrice,
  ORDER_STATUSES,
  type OrderStatus,
} from "@/lib/config";
import { toUserError } from "@/lib/errors";
import { getAccessToken } from "@/lib/auth";

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
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  customer_note: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_title: string;
  quantity: number;
  price: number | null;
  unit_price: number | null;
  subtotal: number | null;
};

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [status, setStatus] = useState<OrderStatus>("pending");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [emailNote, setEmailNote] = useState("");

  useEffect(() => {
    let active = true;

    async function loadOrder() {
      setLoading(true);
      setError("");

      const orderResult = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (!active) return;

      if (orderResult.error) {
        setError(toUserError(orderResult.error.message));
        setLoading(false);
        return;
      }

      const itemsResult = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at");

      if (!active) return;

      if (itemsResult.error) {
        setError(toUserError(itemsResult.error.message));
        setLoading(false);
        return;
      }

      const orderData = orderResult.data as Order;
      const nextStatus = (orderData.order_status ||
        orderData.status ||
        "pending") as OrderStatus;

      setOrder(orderData);
      setItems((itemsResult.data || []) as OrderItem[]);
      setStatus(
        ORDER_STATUSES.includes(nextStatus) ? nextStatus : "pending"
      );
      setLoading(false);
    }

    loadOrder();

    return () => {
      active = false;
    };
  }, [orderId]);

  async function saveStatus() {
    if (!order) return;

    setSaving(true);
    setError("");
    setSuccess("");
    setEmailNote("");

    const previousOrderStatus = order.order_status || order.status;
    const previousPaymentStatus = order.payment_status;

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status,
        order_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (updateError) {
      setError(toUserError(updateError.message));
      setSaving(false);
      return;
    }

    setOrder((current) =>
      current
        ? {
            ...current,
            status,
            order_status: status,
            updated_at: new Date().toISOString(),
          }
        : current
    );

    setSuccess("Order updated successfully.");

    try {
      const token = await getAccessToken();
      if (token) {
        const response = await fetch(`/api/admin/orders/${orderId}/notify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            orderId,
            previousPaymentStatus,
            previousOrderStatus,
          }),
        });
        const payload = await response.json();
        if (payload.results) {
          const notes = (payload.results as Array<{ event: string; ok: boolean; reason?: string }>)
            .map((item) =>
              item.ok
                ? `${item.event}: email sent`
                : `${item.event}: ${item.reason || "email not sent"}`
            )
            .join(" · ");
          setEmailNote(notes);
        } else if (payload.reason) {
          setEmailNote(payload.reason);
        }
      }
    } catch {
      setEmailNote("Email notification could not be processed.");
    }

    setSaving(false);
  }

  function formatDate(date: string | null) {
    if (!date) return "-";
    return new Date(date).toLocaleString("en-MY", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function itemPrice(item: OrderItem) {
    return Number(item.unit_price || item.price || 0);
  }

  function itemSubtotal(item: OrderItem) {
    const sub = Number(item.subtotal || 0);
    if (sub > 0) return sub;
    return itemPrice(item) * Number(item.quantity || 1);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <div className="mx-auto max-w-5xl">Loading order...</div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-xl border border-red-900 bg-red-950/40 p-5 text-red-400">
            {error || "Order not found."}
          </div>
          <Link
            href="/admin/orders"
            className="mt-5 inline-block text-sm text-slate-400 hover:text-white"
          >
            ← Back to Orders
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white md:p-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/admin/orders"
          className="text-sm text-slate-400 hover:text-white"
        >
          ← Back to Orders
        </Link>

        <div className="mt-5">
          <h1 className="text-3xl font-bold">Order Details</h1>
          <p className="mt-2 font-mono text-sm text-blue-300">
            {order.order_number || order.id}
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-6 rounded-xl border border-green-900 bg-green-950/40 p-4 text-sm text-green-400">
            {success}
            {emailNote ? (
              <div className="mt-2 text-slate-300">{emailNote}</div>
            ) : null}
          </div>
        )}

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Customer</h2>
            <div className="mt-6 space-y-4 text-sm">
              <div>
                <div className="text-xs text-slate-500">Name</div>
                <div className="mt-1">{order.customer_name || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Email</div>
                <div className="mt-1">{order.customer_email || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">WhatsApp</div>
                <div className="mt-1 text-green-400">
                  {order.customer_whatsapp || "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Customer Type</div>
                <div className="mt-1">
                  {order.customer_id ? "Registered User" : "Guest Customer"}
                </div>
              </div>
              {order.customer_id && (
                <div>
                  <div className="text-xs text-slate-500">User ID</div>
                  <div className="mt-1 break-all font-mono text-xs text-slate-400">
                    {order.customer_id}
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs text-slate-500">Order Date</div>
                <div className="mt-1">{formatDate(order.created_at)}</div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Payment</h2>
            <div className="mt-6 space-y-4 text-sm">
              <div>
                <div className="text-xs text-slate-500">Total</div>
                <div className="mt-1 text-2xl font-bold">
                  {formatPrice(
                    Number(order.total_amount ?? order.total ?? 0),
                    order.currency || "MYR"
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Payment Method</div>
                <div className="mt-1">
                  {order.payment_method?.startsWith("stripe")
                    ? "Legacy online payment"
                    : order.payment_method || "Manual / off-site"}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Payment Channel</div>
                <div className="mt-1">
                  {order.payment_method?.startsWith("stripe")
                    ? "Historical (website payment removed)"
                    : "WhatsApp / Shopee / Manual"}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Payment Status</div>
                <div className="mt-1 capitalize">{order.payment_status || "pending"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Legacy Session ID</div>
                <div className="mt-1 break-all font-mono text-xs text-slate-400">
                  {order.stripe_checkout_session_id || "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Legacy Payment Intent ID</div>
                <div className="mt-1 break-all font-mono text-xs text-slate-400">
                  {order.stripe_payment_intent_id || "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Payment Date</div>
                <div className="mt-1">
                  {order.payment_status && order.payment_status !== "pending"
                    ? formatDate(order.updated_at)
                    : "-"}
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">Order Status</h2>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Order Status
              </label>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as OrderStatus)
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
              >
                {ORDER_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={saveStatus}
            disabled={saving}
            className="mt-6 rounded-xl bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Status"}
          </button>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">Order Items</h2>

          {items.length === 0 ? (
            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-6 text-center text-sm text-slate-500">
              No items in this order.
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-slate-400">Product</th>
                    <th className="px-4 py-3 text-slate-400">Quantity</th>
                    <th className="px-4 py-3 text-slate-400">Unit Price</th>
                    <th className="px-4 py-3 text-slate-400">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-4">{item.product_title}</td>
                      <td className="px-4 py-4">{item.quantity}</td>
                      <td className="px-4 py-4">
                        {formatPrice(itemPrice(item), order.currency || "MYR")}
                      </td>
                      <td className="px-4 py-4 font-semibold">
                        {formatPrice(
                          itemSubtotal(item),
                          order.currency || "MYR"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {order.customer_note && (
          <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Customer Note</h2>
            <div className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-sm text-slate-300">
              {order.customer_note}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
