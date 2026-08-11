import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/config";

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
            By browsing or purchasing from {SITE_NAME}, you agree to use the
            storefront for lawful purposes and to provide accurate checkout
            information.
          </p>
          <p>
            Game accounts are unique digital goods. Availability is not
            guaranteed until payment is confirmed by our payment provider and
            the order is marked paid by our server.
          </p>
          <p>
            Delivery is handled manually after successful payment. Login
            credentials and handoff details are shared through the contact
            channel confirmed at checkout.
          </p>
          <p>
            We may refuse or cancel orders that appear fraudulent, duplicated,
            or in violation of game-publisher policies.
          </p>
        </div>
      </div>
    </main>
  );
}
