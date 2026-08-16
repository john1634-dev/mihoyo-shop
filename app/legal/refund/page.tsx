import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, buildWhatsAppUrl } from "@/lib/config";

export const metadata: Metadata = {
  title: "Refund Policy",
  robots: { index: true, follow: true },
};

export default function RefundPage() {
  return (
    <main className="storefront-main min-h-screen px-4 py-12 md:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Back to {SITE_NAME}
        </Link>
        <h1 className="mt-6 text-3xl font-bold">Refund Policy</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Last updated: 2026</p>
        <div className="mt-8 space-y-4 text-sm leading-relaxed text-[var(--muted-strong)]">
          <p>
            Game accounts are unique digital goods. Refunds are assessed case by
            case based on the purchase channel (Stripe card checkout, WhatsApp,
            or Shopee).
          </p>
          <p>
            Payment confirms an order for sourcing and manual delivery. It does
            not mean an account is already held in inventory or delivered
            instantly.
          </p>
          <p>
            If we cannot source or deliver an account as described after payment,
            contact us promptly with your order number. Where appropriate we may
            cancel the order and issue a refund to the original payment method
            (for Stripe) or via the original channel (WhatsApp / Shopee).
          </p>
          <p>
            After an account has been delivered and accepted, refunds are
            generally not available, except where required by law or where we
            confirm a material listing error on our side.
          </p>
          <p>
            <a
              href={buildWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:text-emerald-300"
            >
              Contact support on WhatsApp
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
