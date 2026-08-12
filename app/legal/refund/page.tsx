import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, buildWhatsAppUrl } from "@/lib/config";

export const metadata: Metadata = {
  title: "Refund Policy",
  robots: { index: true, follow: true },
};

export default function RefundPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-white md:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-slate-400 hover:text-white">
          ← Back to {SITE_NAME}
        </Link>
        <h1 className="mt-6 text-3xl font-bold">Refund Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: 2026</p>
        <div className="mt-8 space-y-4 text-sm leading-relaxed text-slate-300">
          <p>
            Because game accounts are unique digital goods, refunds are handled
            case by case on the channel where you purchased (WhatsApp or Shopee).
          </p>
          <p>
            Contact us promptly with your listing details if an account cannot
            be delivered as described.
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
