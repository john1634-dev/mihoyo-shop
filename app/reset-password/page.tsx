"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";
import { toUserError } from "@/lib/errors";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function prepare() {
      // Supabase recovery links land with tokens in the URL hash / session
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      if (!session) {
        setError(
          "Reset link is invalid or expired. Please request a new one."
        );
        setReady(true);
        return;
      }

      setReady(true);
    }

    prepare();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setError("");
        setReady(true);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(toUserError(updateError.message));
      setLoading(false);
      return;
    }

    setSuccess("Password updated. Redirecting to your account...");
    setTimeout(() => {
      router.replace("/account");
      router.refresh();
    }, 800);
  }

  return (
    <main className="storefront-main flex min-h-screen flex-col">
      <Navbar />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">Reset Password</h1>
          <p className="mt-2 text-[var(--muted)]">Choose a new password</p>
        </div>

        {!ready ? (
          <div className="text-center text-[var(--muted)]">Loading...</div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] p-8"
          >
            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm text-[var(--muted-strong)]">
                  New Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-card)] text-[var(--foreground)] px-4 py-3 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[var(--muted-strong)]">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-card)] text-[var(--foreground)] px-4 py-3 outline-none focus:border-blue-500"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-400">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-xl border border-green-900 bg-green-950/40 p-4 text-sm text-green-400">
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || Boolean(success)}
                className="btn-primary w-full disabled:opacity-50"
              >
                {loading ? "Updating..." : "Update Password"}
              </button>
            </div>

            <p className="mt-6 text-center text-sm text-[var(--muted)]">
              <Link
                href="/forgot-password"
                className="text-[var(--accent-strong)] hover:text-[var(--accent)]"
              >
                Request a new reset link
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
