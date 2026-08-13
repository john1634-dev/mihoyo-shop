"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { adminFetch } from "@/lib/admin-api";
import {
  EMPTY_MANUAL_FULFILL_FORM,
  mapManualFulfillError,
  orderNeedsManualAccount,
  showEmailSentState,
  showManualFulfillForm,
  showRetryEmailAction,
  type AdminOrderEmailDeliveryMeta,
  type AdminOrderInventoryMeta,
} from "@/lib/admin-order-fulfillment-ui";
import { formatPrice } from "@/lib/config";
import { customerFacingStatusLabel, type OrderStatus } from "@/lib/orders";

type OrderDetail = {
  id: string;
  order_number: string | null;
  status: OrderStatus;
  order_status: string | null;
  payment_status: string | null;
  customer_email: string | null;
  customer_name: string | null;
  currency: string;
  amount: number;
  channel: string | null;
  created_at: string;
  paid_at: string | null;
  fulfilled_at: string | null;
};

type OrderItem = {
  id: string;
  title: string;
  price: number;
  product_id: string | null;
  quantity: number | null;
};

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [inventory, setInventory] = useState<AdminOrderInventoryMeta | null>(null);
  const [emailDelivery, setEmailDelivery] =
    useState<AdminOrderEmailDeliveryMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [form, setForm] = useState(EMPTY_MANUAL_FULFILL_FORM);
  const [, startTransition] = useTransition();

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch(`/api/admin/orders/${orderId}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to load order.");
      }
      setOrder(data.order as OrderDetail);
      setItems((data.items || []) as OrderItem[]);
      setInventory((data.inventory || null) as AdminOrderInventoryMeta);
      setEmailDelivery(
        (data.email_delivery || null) as AdminOrderEmailDeliveryMeta
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load order.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load, startTransition]);

  async function submitManualFulfill(event: React.FormEvent) {
    event.preventDefault();
    if (!order || submitting) return;

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const res = await adminFetch("/api/admin/orders/manual-fulfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: order.id,
          login: form.login,
          password: form.password,
          email: form.email,
          extra: form.extra,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        throw new Error(
          mapManualFulfillError(data.error_code, data.status)
        );
      }

      if (data.status === "already_sent") {
        setSuccess("This account has already been sent.");
      } else if (data.status === "sent") {
        setSuccess("Account email sent successfully.");
      } else if (data.status === "in_progress") {
        setSuccess("Email delivery is already in progress.");
      }

      setForm(EMPTY_MANUAL_FULFILL_FORM);
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : mapManualFulfillError(undefined)
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function retryEmail() {
    if (!order || retrying) return;
    setRetrying(true);
    setError("");
    setSuccess("");
    try {
      const res = await adminFetch("/api/admin/inventory/deliver-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(
          mapManualFulfillError(data.error_code, data.status)
        );
      }
      setSuccess(
        data.status === "already_sent"
          ? "This account has already been sent."
          : "Account email sent successfully."
      );
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Email delivery failed."
      );
    } finally {
      setRetrying(false);
    }
  }

  const view = order
    ? {
        payment_status: order.payment_status,
        status: order.status,
        inventory,
        email_delivery: emailDelivery,
      }
    : null;

  const needsManual = view ? orderNeedsManualAccount(view) : false;
  const manualFormVisible = view ? showManualFulfillForm(view) : false;
  const retryVisible = view ? showRetryEmailAction(view) : false;
  const emailSent = view ? showEmailSentState(view) : false;

  return (
    <div className="mx-auto min-w-0 max-w-4xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <Link
          href="/admin/orders"
          className="text-sm text-slate-400 hover:text-white"
        >
          ← Back to Orders
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Order Detail</h1>
        <p className="mt-1 text-sm text-slate-400">
          Manual account fulfillment for paid orders without inventory stock.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-900/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {success}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-40 rounded-2xl bg-slate-900" />
          <div className="h-56 rounded-2xl bg-slate-900" />
        </div>
      ) : !order ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-slate-400">
          Order not found.
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          <section className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold break-words">
                  {order.order_number || order.id.slice(0, 8)}
                </h2>
                <p className="mt-1 break-all font-mono text-xs text-slate-500">{order.id}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {needsManual && (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
                    Needs Manual Account
                  </span>
                )}
                {emailSent && (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                    ✓ Account email sent
                  </span>
                )}
              </div>
            </div>

            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-400">Order status</dt>
                <dd className="mt-1 font-medium">
                  {customerFacingStatusLabel(order.status)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Payment status</dt>
                <dd className="mt-1 capitalize">{order.payment_status || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Amount</dt>
                <dd className="mt-1 font-semibold">
                  {formatPrice(order.amount, order.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Channel</dt>
                <dd className="mt-1 capitalize">{order.channel || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Created</dt>
                <dd className="mt-1">
                  {new Date(order.created_at).toLocaleString("en-MY")}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Paid</dt>
                <dd className="mt-1">
                  {order.paid_at
                    ? new Date(order.paid_at).toLocaleString("en-MY")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Fulfilled</dt>
                <dd className="mt-1">
                  {order.fulfilled_at
                    ? new Date(order.fulfilled_at).toLocaleString("en-MY")
                    : "—"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Customer</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-slate-400">Name</dt>
                <dd className="mt-1">{order.customer_name || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Email</dt>
                <dd className="mt-1 break-all text-slate-300">
                  {order.customer_email || "No email"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Product</dt>
                <dd className="mt-1 break-words">
                  {items.map((item) => item.title).join(", ") || "—"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Fulfillment</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-400">Inventory</dt>
                <dd className="mt-1 capitalize">
                  {inventory?.exists
                    ? `${inventory.status}${inventory.id ? ` · ${inventory.id.slice(0, 8)}…` : ""}`
                    : "Not assigned"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Email delivery</dt>
                <dd className="mt-1 capitalize">
                  {emailDelivery?.status || "Not attempted"}
                </dd>
              </div>
              {emailDelivery?.provider_message_id && (
                <div className="sm:col-span-2">
                  <dt className="text-slate-400">Provider message ID</dt>
                  <dd className="mt-1 font-mono text-xs text-slate-300">
                    {emailDelivery.provider_message_id}
                  </dd>
                </div>
              )}
              {emailDelivery?.error_code && (
                <div>
                  <dt className="text-slate-400">Delivery error</dt>
                  <dd className="mt-1 text-amber-300">{emailDelivery.error_code}</dd>
                </div>
              )}
              {emailDelivery?.updated_at && (
                <div>
                  <dt className="text-slate-400">Last delivery update</dt>
                  <dd className="mt-1">
                    {new Date(emailDelivery.updated_at).toLocaleString("en-MY")}
                  </dd>
                </div>
              )}
            </dl>

            {retryVisible && (
              <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm text-amber-200">Email delivery failed.</p>
                <button
                  type="button"
                  disabled={retrying}
                  onClick={() => void retryEmail()}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-blue-500/40 px-4 py-2.5 text-sm font-medium text-blue-200 hover:border-blue-400 disabled:opacity-50 sm:w-auto"
                >
                  {retrying ? "Retrying…" : "Retry Email"}
                </button>
              </div>
            )}

            {emailSent && !manualFormVisible && (
              <p className="mt-5 text-sm text-emerald-300">
                Account credentials were emailed to the customer. Credentials are
                not shown here for security.
              </p>
            )}
          </section>

          {manualFormVisible && (
            <section className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
              <h2 className="text-lg font-semibold">Manual Account Entry</h2>
              <p className="mt-1 text-sm text-slate-400">
                Enter account credentials to create encrypted inventory and email
                the customer.
              </p>

              {order.customer_email ? (
                <p className="mt-4 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200">
                  Customer will receive the account at:{" "}
                  <strong className="break-all">{order.customer_email}</strong>
                </p>
              ) : (
                <p className="mt-4 text-sm text-amber-300">
                  Customer email is missing — manual fulfillment is blocked.
                </p>
              )}

              <form onSubmit={(e) => void submitManualFulfill(e)} className="mt-5 space-y-4">
                <label className="block text-xs text-slate-400">
                  Login
                  <input
                    required
                    autoComplete="off"
                    value={form.login}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, login: e.target.value }))
                    }
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                </label>

                <label className="block text-xs text-slate-400">
                  Password
                  <input
                    required
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        password: e.target.value,
                      }))
                    }
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                </label>

                <label className="block text-xs text-slate-400">
                  Account email (credential field, optional)
                  <input
                    type="email"
                    autoComplete="off"
                    value={form.email}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, email: e.target.value }))
                    }
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                </label>

                <label className="block text-xs text-slate-400">
                  Extra
                  <textarea
                    value={form.extra}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, extra: e.target.value }))
                    }
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                </label>

                <button
                  type="submit"
                  disabled={submitting || !order.customer_email}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
                >
                  {submitting ? "Sending…" : "Send account email"}
                </button>
              </form>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
