import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/config";

export const metadata: Metadata = {
  title: "Privacy Policy",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-white md:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-slate-400 hover:text-white">
          ← Back to {SITE_NAME}
        </Link>
        <h1 className="mt-6 text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: 2026</p>
        <div className="mt-8 space-y-4 text-sm leading-relaxed text-slate-300">
          <p>
            If you create an account, we store authentication and profile data
            needed for your wishlist, orders, and account settings.
          </p>
          <p>
            For card checkout we collect the email address needed to create the
            order and send receipt/status information. Card payments are
            processed by Stripe; we do not store full card numbers on our
            servers.
          </p>
          <p>
            Purchase conversations on WhatsApp or Shopee are handled on those
            platforms under their own policies.
          </p>
          <p>
            Catalogue, order, and authentication data is stored in Supabase with
            row-level security and server-side admin checks. We do not expose
            payment secrets or service credentials to the browser.
          </p>
        </div>
      </div>
    </main>
  );
}
