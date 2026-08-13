import { Suspense } from "react";
import type { Metadata } from "next";
import CheckoutSuccessClient from "@/components/CheckoutSuccessClient";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
          <p className="text-sm text-slate-400">Loading checkout status…</p>
        </main>
      }
    >
      <CheckoutSuccessClient />
    </Suspense>
  );
}
