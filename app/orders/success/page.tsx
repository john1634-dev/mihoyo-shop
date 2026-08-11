"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  buildWhatsAppUrl,
  formatPrice,
  isWhatsAppConfigured,
} from "@/lib/config";
import { buildPurchaseWhatsAppMessage, type OrderReceipt } from "@/lib/orders";
import { getAccessToken } from "@/lib/auth";
import { toUserError } from "@/lib/errors";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

function SuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("id");
  const orderNumberFromQuery = searchParams.get("no");

  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);
  const [loading, setLoading] = useState(Boolean(orderId));
  const [error, setError] = useState(orderId ? "" : "Order not found.");

  useEffect(() => {
    if (!orderId) {
      return;
    }

    let active = true;

    async function loadReceipt() {
      try {
        const token = await getAccessToken();
        const headers: Record<string, string> = {};
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(`/api/orders/${orderId}`, { headers });
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
        setError("We could not load your order details.");
        setLoading(false);
      }
    }

    loadReceipt();

    return () => {
      active = false;
    };
  }, [orderId]);

  const paymentStatus = receipt?.payment_status;

  const orderNumber =
    receipt?.order_number || orderNumberFromQuery || orderId?.slice(0, 8) || "";

  const whatsappUrl =
    receipt?.payment_status === "paid" && isWhatsAppConfigured()
      ? buildWhatsAppUrl(
          buildPurchaseWhatsAppMessage({
            orderNumber: receipt.order_number,
            customerName: receipt.customer_name || "",
            customerEmail: receipt.customer_email || "",
            customerWhatsapp: receipt.customer_whatsapp || "",
            items: (receipt.items || []).map((item) => ({
              title: item.title,
              price: Number(item.price),
            })),
            total: Number(receipt.total || 0),
            currency: receipt.currency || "MYR",
          })
        )
      : null;

  const title =
    paymentStatus === "paid"
      ? "Payment Successful"
      : paymentStatus === "failed"
        ? "Payment Failed"
        : "Payment Processing";

  const subtitle =
    paymentStatus === "paid"
      ? "Thank you for your order. We will proceed with fulfillment shortly."
      : paymentStatus === "failed"
        ? "Payment could not be completed. Please try again."
        : "We are waiting for your payment to be confirmed by Stripe.";

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center text-slate-400">
        Loading order...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 md:py-16 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-3xl text-red-300">
          !
        </div>
        <h1 className="mt-6 text-3xl font-bold">Unable to verify payment status</h1>
        <p className="mt-4 text-slate-400">
          Please refresh this page or contact support if you already completed payment.
        </p>
        <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-400">
          {error}
        </div>
        <div className="mt-8 flex justify-center">
          <Link
            href="/checkout"
            className="rounded-xl border border-slate-700 px-6 py-3 text-center text-sm font-semibold text-white hover:border-blue-500"
          >
            Back to Checkout
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 md:py-16">
      <div className="text-center">
        <div
          className={[
            "mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl",
            paymentStatus === "paid"
              ? "bg-green-500/10 text-green-300"
              : paymentStatus === "failed"
                ? "bg-red-500/10 text-red-300"
                : "bg-blue-500/10 text-blue-300",
          ].join(" ")}
        >
          {paymentStatus === "paid" ? "✓" : paymentStatus === "failed" ? "!" : "…"}
        </div>

        <h1 className="mt-6 text-3xl font-bold">{title}</h1>

        <p className="mt-4 text-slate-400">{subtitle}</p>

        {orderNumber && (
          <p className="mt-4 font-mono text-sm text-blue-300">
            Order ID: {orderNumber}
          </p>
        )}
      </div>

      {error && (
        <div className="mt-8 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {receipt && (
        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-left">
          <h2 className="text-lg font-semibold">Order Summary</h2>

          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Email</span>
              <span className="text-right">{receipt.customer_email || "-"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">WhatsApp</span>
              <span className="text-right">
                {receipt.customer_whatsapp || "-"}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Payment Status</span>
              <span className="text-right capitalize">
                {receipt.payment_status || "pending"}
              </span>
            </div>
          </div>

          <div className="mt-6 space-y-3 border-t border-slate-800 pt-4">
            {(receipt.items || []).map((item, index) => (
              <div key={`${item.title}-${index}`} className="flex justify-between gap-4 text-sm">
                <span className="min-w-0 truncate">{item.title}</span>
                <span className="shrink-0">
                  {formatPrice(
                    Number(item.subtotal || item.price),
                    receipt.currency
                  )}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-between border-t border-slate-800 pt-4 text-lg font-bold">
            <span>Total</span>
            <span>{formatPrice(Number(receipt.total || 0), receipt.currency)}</span>
          </div>
        </section>
      )}

      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-green-600 px-6 py-3 text-center font-semibold transition hover:bg-green-500"
          >
            Contact via WhatsApp
          </a>
        ) : null}

        <Link
          href="/products"
          className="rounded-xl border border-slate-700 px-6 py-3 text-center font-semibold transition hover:border-blue-500"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <Navbar />
      <Suspense
        fallback={
          <div className="px-6 py-16 text-center text-slate-400">Loading...</div>
        }
      >
        <SuccessContent />
      </Suspense>
      <Footer />
    </main>
  );
}
