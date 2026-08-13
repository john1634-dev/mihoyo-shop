"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { adminFetch } from "@/lib/admin-api";
import { formatPrice } from "@/lib/config";
import { customerFacingStatusLabel, type OrderStatus } from "@/lib/orders";

type AdminOrder = {
  id: string;
  order_number: string | null;
  customer_email: string | null;
  customer_name: string | null;
  status: OrderStatus;
  payment_status: string | null;
  currency: string;
  amount: number;
  channel: string | null;
  created_at: string;
  paid_at: string | null;
  sourcing_started_at: string | null;
  fulfilled_at: string | null;
  delivery_note: string | null;
  delivery_method: string | null;
  admin_note: string | null;
  inventory: { id: string; status: string } | null;
  email_delivery: { status: string; provider_message_id: string | null } | null;
  items: Array<{ title: string; price: number; product_id: string | null }>;
};

const ACTIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  paid: ["sourcing", "cancelled", "refunded"],
  sourcing: ["fulfilled", "cancelled", "refunded"],
  fulfilled: ["refunded"],
  pending: ["cancelled"],
  failed: ["cancelled"],
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [notes, setNotes] = useState<
    Record<string, { delivery_note: string; delivery_method: string; admin_note: string }>
  >({});
  const [, startTransition] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch("/api/admin/orders", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load orders.");
      const list = (data.orders || []) as AdminOrder[];
      setOrders(list);
      const nextNotes: typeof notes = {};
      for (const order of list) {
        nextNotes[order.id] = {
          delivery_note: order.delivery_note || "",
          delivery_method: order.delivery_method || "",
          admin_note: order.admin_note || "",
        };
      }
      setNotes(nextNotes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load, startTransition]);

  async function updateStatus(orderId: string, status: OrderStatus) {
    setBusyId(orderId);
    setError("");
    try {
      const note = notes[orderId] || {
        delivery_note: "",
        delivery_method: "",
        admin_note: "",
      };
      const res = await adminFetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          status,
          delivery_note: note.delivery_note,
          delivery_method: note.delivery_method,
          admin_note: note.admin_note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Update failed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId("");
    }
  }

  async function sendAccountEmail(orderId: string) {
    setBusyId(orderId);
    setError("");
    try {
      const res = await adminFetch("/api/admin/inventory/deliver-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(
          data.error_code
            ? `Email delivery failed (${data.error_code})`
            : data.error || "Email delivery failed."
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Email delivery failed.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manual sourcing workflow: paid → sourcing → fulfilled. Do not store
            account passwords in notes.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="btn-secondary">
          Refresh
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-900/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-8 animate-pulse space-y-3">
          <div className="h-28 rounded-2xl bg-slate-900" />
          <div className="h-28 rounded-2xl bg-slate-900" />
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-slate-400">
          No orders yet.
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {orders.map((order) => {
            const actions = ACTIONS[order.status] || [];
            const note = notes[order.id] || {
              delivery_note: "",
              delivery_method: "",
              admin_note: "",
            };
            return (
              <article
                key={order.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {order.order_number || order.id.slice(0, 8)}
                    </p>
                    <p className="mt-1 text-sm text-slate-300">
                      {order.customer_email || "No email"}
                      {order.customer_name ? ` · ${order.customer_name}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(order.created_at).toLocaleString("en-MY")}
                      {order.channel ? ` · ${order.channel}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {customerFacingStatusLabel(order.status)}
                    </p>
                    <p className="mt-1 text-lg font-bold">
                      {formatPrice(order.amount, order.currency)}
                    </p>
                    <p className="mt-1 text-xs capitalize text-slate-500">
                      payment: {order.payment_status || "pending"}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm text-slate-200">
                  {order.items.map((i) => i.title).join(", ") || "—"}
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <label className="block text-xs text-slate-400">
                    Delivery method
                    <input
                      value={note.delivery_method}
                      onChange={(e) =>
                        setNotes((prev) => ({
                          ...prev,
                          [order.id]: { ...note, delivery_method: e.target.value },
                        }))
                      }
                      placeholder="WhatsApp / Email"
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs text-slate-400 md:col-span-2">
                    Delivery note (no passwords)
                    <input
                      value={note.delivery_note}
                      onChange={(e) =>
                        setNotes((prev) => ({
                          ...prev,
                          [order.id]: { ...note, delivery_note: e.target.value },
                        }))
                      }
                      placeholder="Sent via WhatsApp…"
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs text-slate-400 md:col-span-3">
                    Internal admin note
                    <textarea
                      value={note.admin_note}
                      onChange={(e) =>
                        setNotes((prev) => ({
                          ...prev,
                          [order.id]: { ...note, admin_note: e.target.value },
                        }))
                      }
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                {actions.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {actions.map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={busyId === order.id}
                        onClick={() => void updateStatus(order.id, status)}
                        className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium hover:border-blue-500 disabled:opacity-50"
                      >
                        Mark {status}
                      </button>
                    ))}
                  </div>
                )}

                {order.payment_status === "paid" &&
                  order.inventory &&
                  (order.inventory.status === "assigned" ||
                    order.inventory.status === "delivered") && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {order.email_delivery?.status === "sent" ||
                      order.status === "fulfilled" ? (
                        <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                          Email Sent
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === order.id}
                          onClick={() => void sendAccountEmail(order.id)}
                          className="rounded-lg border border-blue-500/40 px-3 py-2 text-xs font-medium text-blue-200 hover:border-blue-400 disabled:opacity-50"
                        >
                          {order.email_delivery?.status === "failed"
                            ? "Retry Email"
                            : "Send Account Email"}
                        </button>
                      )}
                      {order.inventory.status === "assigned" &&
                        order.email_delivery?.status === "failed" && (
                          <span className="text-xs text-amber-300">
                            Last email attempt failed — inventory still assigned
                          </span>
                        )}
                    </div>
                  )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
