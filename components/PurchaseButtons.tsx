"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildProductWhatsAppMessage,
  buildWhatsAppUrl,
  formatPrice,
  resolveShopeeUrl,
} from "@/lib/config";
import { ShopeeIcon, WhatsAppIcon } from "@/components/icons";
import { getAccessToken } from "@/lib/auth";
import { isValidEmail } from "@/lib/validation";
import { supabase } from "@/lib/supabase";

type PurchaseButtonsProps = {
  product: {
    id: string;
    title: string;
    price: number;
    currency?: string;
    server?: string | null;
    ar_level?: number | null;
    slug?: string | null;
    shopee_url?: string | null;
  };
  gameName?: string | null;
  available: boolean;
  layout?: "stack" | "row";
  size?: "sm" | "md" | "lg";
  className?: string;
};

export default function PurchaseButtons({
  product,
  gameName,
  available,
  layout = "stack",
  size = "md",
  className = "",
}: PurchaseButtonsProps) {
  const [showCardForm, setShowCardForm] = useState(false);
  const [email, setEmail] = useState("");
  const [loggedInEmail, setLoggedInEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setLoggedInEmail(data.user?.email ?? null);
      if (data.user?.email) setEmail(data.user.email);
    });
    return () => {
      active = false;
    };
  }, []);

  const priceLabel = useMemo(
    () => formatPrice(Number(product.price), product.currency || "MYR"),
    [product.price, product.currency]
  );

  if (!available) {
    return (
      <div
        className={`rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-center text-sm font-semibold uppercase tracking-wider text-[var(--muted)] ${className}`}
      >
        Sold out
      </div>
    );
  }

  const whatsappHref = buildWhatsAppUrl(
    buildProductWhatsAppMessage({
      id: product.id,
      title: product.title,
      price: Number(product.price),
      currency: product.currency || "MYR",
      gameName,
      server: product.server,
      arLevel: product.ar_level,
      slug: product.slug,
    })
  );

  const shopeeHref = resolveShopeeUrl(product.shopee_url);

  const pad =
    size === "lg"
      ? "px-5 py-3.5 text-sm"
      : size === "sm"
        ? "px-3 py-2.5 text-xs"
        : "px-4 py-3 text-sm";

  const wrap =
    layout === "row"
      ? "grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2"
      : "flex w-full min-w-0 flex-col gap-2.5";

  async function startCardCheckout(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const token = await getAccessToken();
      const payload: { product_id: string; email?: string } = {
        product_id: product.id,
      };

      if (!token) {
        if (!isValidEmail(email)) {
          setError("Enter a valid email for checkout.");
          setLoading(false);
          return;
        }
        payload.email = email.trim();
      }

      const res = await fetch("/api/checkout/create-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Could not start checkout.");
      }

      window.location.href = data.url as string;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
      setLoading(false);
    }
  }

  return (
    <div className={`${wrap} ${className}`}>
      <button
        type="button"
        onClick={() => {
          setShowCardForm((open) => !open);
          setError("");
        }}
        className={`btn-primary ${pad} ${layout === "row" ? "sm:col-span-2" : ""}`}
      >
        Buy with Card — {priceLabel}
      </button>

      {showCardForm && (
        <form
          onSubmit={startCardCheckout}
          className={`space-y-2 rounded-xl border border-[var(--border)] bg-white p-3 shadow-[var(--shadow-card)] sm:p-4 ${
            layout === "row" ? "sm:col-span-2" : ""
          }`}
        >
          <p className="text-xs leading-relaxed text-[var(--muted)]">
            Payment confirms your order. We source and verify the account after
            payment — delivery is manual, not instant.
          </p>
          {loggedInEmail ? (
            <p className="text-xs text-[var(--muted-strong)]">
              Receipt email: <span className="font-medium">{loggedInEmail}</span>
            </p>
          ) : (
            <>
              <label
                className="block text-xs font-medium text-[var(--muted-strong)]"
                htmlFor={`card-email-${product.id}`}
              >
                Email for receipt
              </label>
              <input
                id={`card-email-${product.id}`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent-strong)]"
                autoComplete="email"
                required
              />
            </>
          )}
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full disabled:opacity-60"
          >
            {loading ? "Redirecting to Stripe…" : "Continue to secure checkout"}
          </button>
        </form>
      )}

      <a
        href={shopeeHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`btn-shopee ${pad}`}
      >
        <ShopeeIcon />
        Buy on Shopee
      </a>
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`btn-whatsapp ${pad}`}
      >
        <WhatsAppIcon />
        Chat on WhatsApp
      </a>
    </div>
  );
}
