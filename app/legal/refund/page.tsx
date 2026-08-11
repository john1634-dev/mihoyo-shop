import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/config";

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
            Because account goods are unique and delivered digitally, refunds
            are evaluated case by case after payment confirmation.
          </p>
          <p>
            If an account cannot be delivered as described, contact support
            promptly with your order number. Do not attempt to change credentials
            or transfer the account before support has reviewed the case.
          </p>
          <p>
            Chargebacks for successfully delivered accounts may result in
            account access being revoked and future purchases being blocked.
          </p>
        </div>
      </div>
    </main>
  );
}
