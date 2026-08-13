import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, WHATSAPP_DISPLAY, buildWhatsAppUrl } from "@/lib/config";

export const metadata: Metadata = {
  title: "Terms of Service",
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-white md:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-slate-400 hover:text-white">
          ← Back to {SITE_NAME}
        </Link>
        <h1 className="mt-6 text-3xl font-bold">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: 2026</p>
        <div className="mt-8 space-y-4 text-sm leading-relaxed text-slate-300">
          <p>
            By browsing {SITE_NAME}, you agree to use the catalogue for lawful
            purposes. Listings show public account information for browsing and
            purchase enquiry.
          </p>
          <p>
            You may purchase via card checkout on this website (processed by
            Stripe), WhatsApp ({WHATSAPP_DISPLAY}), or our Shopee store. Card
            payment confirms an order — it does not guarantee instant delivery
            of a game account.
          </p>
          <p>
            Most listings are sourced on demand after payment is confirmed. We
            then manually verify the account and deliver login details through
            an agreed channel (usually WhatsApp or email). Delivery timing
            depends on supplier availability and verification.
          </p>
          <p>
            Availability can change. If an account cannot be sourced after
            payment, we will contact you about cancellation or refund options
            under our Refund Policy.
          </p>
          <p>
            After delivery, you are responsible for securing the account and
            complying with the game publisher&apos;s terms. We do not guarantee
            uninterrupted access against publisher actions outside our control.
          </p>
          <p>
            <a
              href={buildWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:text-emerald-300"
            >
              Contact us on WhatsApp
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
