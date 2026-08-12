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
            enquiry.
          </p>
          <p>
            Purchases are completed off-site via WhatsApp ({WHATSAPP_DISPLAY}) or
            our Shopee store. This website does not process card payments or
            online checkout.
          </p>
          <p>
            Availability can change. Always confirm stock when you contact us.
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
