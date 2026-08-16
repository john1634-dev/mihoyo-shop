"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";

function AuthCallbackForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function handleCallback() {
      const code = searchParams.get("code");

      if (!code) {
        if (!active) return;
        setStatus("error");
        setError("Invalid confirmation link.");
        return;
      }

      const { error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);

      if (!active) return;

      if (exchangeError) {
        setStatus("error");
        setError(
          "Your confirmation link is invalid or has expired. Please request a new confirmation email."
        );
        return;
      }

      router.replace("/account");
      router.refresh();
    }

    void handleCallback();

    return () => {
      active = false;
    };
  }, [router, searchParams]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">Confirm Account</h1>
      </div>

      {status === "loading" ? (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-8 text-center text-[var(--muted)] shadow-[var(--shadow-card)]">
          Confirming your account...
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-8 shadow-[var(--shadow-card)]">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
          <p className="mt-6 text-center text-sm text-[var(--muted)]">
            <Link href="/register" className="text-[var(--accent-strong)] hover:text-[var(--accent)]">
              Register again
            </Link>
            {" · "}
            <Link href="/login" className="text-[var(--accent-strong)] hover:text-[var(--accent)]">
              Login
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <main className="storefront-main flex min-h-screen flex-col">
      <Navbar />
      <Suspense
        fallback={
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12 text-center text-[var(--muted)]">
            Confirming your account...
          </div>
        }
      >
        <AuthCallbackForm />
      </Suspense>
    </main>
  );
}
