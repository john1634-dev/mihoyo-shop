"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import AccountGuard from "@/components/AccountGuard";
import Navbar from "@/components/Navbar";
import { getProfile, type Profile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { buildWhatsAppUrl } from "@/lib/config";

export default function AccountPage() {
  return (
    <AccountGuard>
      <AccountContent />
    </AccountGuard>
  );
}

function AccountContent() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const {
        data: { user: current },
      } = await supabase.auth.getUser();

      if (!active) return;

      if (!current) {
        router.replace("/login");
        return;
      }

      const profileData = await getProfile(current.id);

      if (!active) return;

      setUser(current);
      setProfile(profileData);
      setLoading(false);
    }

    void load();

    return () => {
      active = false;
    };
  }, [router]);

  async function logout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <Navbar />

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 md:px-6">
        <h1 className="text-3xl font-bold tracking-tight">My Account</h1>
        <p className="mt-2 text-slate-400">
          Manage your profile and saved listings.
        </p>

        {loading ? (
          <div className="mt-10 animate-pulse space-y-4">
            <div className="h-40 rounded-2xl bg-slate-900" />
            <div className="h-24 rounded-2xl bg-slate-900" />
          </div>
        ) : (
          <div className="mt-10 space-y-5">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-lg font-semibold">Profile</h2>
              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-slate-500">Email</dt>
                  <dd className="mt-1">{user?.email}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Name</dt>
                  <dd className="mt-1">
                    {profile?.full_name ||
                      user?.user_metadata?.full_name ||
                      "—"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-slate-500">Member since</dt>
                  <dd className="mt-1">
                    {user?.created_at
                      ? new Date(user.created_at).toLocaleDateString("en-MY", {
                          dateStyle: "medium",
                        })
                      : "—"}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Wishlist</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Accounts you have saved for later.
                  </p>
                </div>
                <Link
                  href="/account/wishlist"
                  className="inline-flex justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium transition hover:bg-blue-500"
                >
                  View wishlist
                </Link>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-lg font-semibold">Need help?</h2>
              <p className="mt-2 text-sm text-slate-400">
                Contact us on WhatsApp for availability and purchase support.
              </p>
              <a
                href={buildWhatsAppUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold transition hover:bg-emerald-500"
              >
                Chat on WhatsApp
              </a>
            </section>

            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="rounded-xl border border-slate-700 px-5 py-3 text-sm transition hover:border-red-500/60 hover:text-red-300 disabled:opacity-50"
            >
              {loggingOut ? "Logging out..." : "Log out"}
            </button>
          </div>
        )}
      </div>

    </main>
  );
}
