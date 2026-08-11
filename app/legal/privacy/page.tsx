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
            We collect information needed to process orders: name, email,
            WhatsApp number, and account identifiers if you register.
          </p>
          <p>
            Payment card details are processed by Stripe. We do not store full
            card numbers on our servers.
          </p>
          <p>
            Order and authentication data is stored in Supabase. Access is
            controlled with row-level security and server-side authorization
            checks.
          </p>
          <p>
            We do not sell personal data. Contact us via the storefront support
            channel if you need an account-related data request.
          </p>
        </div>
      </div>
    </main>
  );
}
