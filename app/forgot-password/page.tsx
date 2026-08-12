"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { SITE_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { toUserError } from "@/lib/errors";
import { isValidEmail, sanitizeText } from "@/lib/validation";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const mail = sanitizeText(email, 200).toLowerCase();
    if (!isValidEmail(mail)) {
      setError("Please enter a valid email.");
      setLoading(false);
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      mail,
      {
        redirectTo: `${SITE_URL.replace(/\/$/, "")}/reset-password`,
      }
    );

    if (resetError) {
      setError(toUserError(resetError.message));
      setLoading(false);
      return;
    }

    setSuccess(
      "If an account exists for this email, a reset link has been sent."
    );
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <Navbar />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">Forgot Password</h1>
          <p className="mt-2 text-slate-400">
            We will email you a reset link
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-800 bg-slate-900 p-8"
        >
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm text-slate-300">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
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
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-slate-400">
            <Link href="/login" className="text-blue-400 hover:text-blue-300">
              Back to login
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
