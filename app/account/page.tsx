"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import AccountGuard from "@/components/AccountGuard";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getProfile, type Profile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { toUserError } from "@/lib/errors";

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
  const [orderCount, setOrderCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
      const { count, error: countError } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", current.id);

      if (!active) return;

      if (countError) {
        setError(toUserError(countError.message));
      }

      setUser(current);
      setProfile(profileData);
      setOrderCount(count || 0);
      setLoading(false);
    }

    load();

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

      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 md:px-6">
        <h1 className="text-3xl font-bold">My Account</h1>
        <p className="mt-2 text-slate-400">Manage your profile and orders</p>

        {loading ? (
          <p className="mt-10 text-slate-400">Loading account...</p>
        ) : error ? (
          <div className="mt-10 rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-400">
            {error}
          </div>
        ) : (
          <div className="mt-10 space-y-6">
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold">Profile</h2>
              <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-xs text-slate-500">Email</div>
                  <div className="mt-1">{user?.email}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Name</div>
                  <div className="mt-1">
                    {profile?.full_name ||
                      user?.user_metadata?.full_name ||
                      "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Account created</div>
                  <div className="mt-1">
                    {user?.created_at
                      ? new Date(user.created_at).toLocaleString("en-MY", {
                          dateStyle: "medium",
                        })
                      : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Orders</div>
                  <div className="mt-1">{orderCount}</div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Wishlist</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    View saved products
                  </p>
                </div>
                <Link
                  href="/account/wishlist"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
                >
                  View Wishlist
                </Link>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Referral Program</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Share your link and track referrals
                  </p>
                </div>
                <Link
                  href="/account/affiliate"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
                >
                  Affiliate Dashboard
                </Link>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Order History</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    View your past purchases
                  </p>
                </div>
                <Link
                  href="/account/orders"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
                >
                  View Orders
                </Link>
              </div>
            </section>

            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="rounded-xl border border-slate-700 px-5 py-3 text-sm hover:border-red-500 hover:text-red-400 disabled:opacity-50"
            >
              {loggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}
