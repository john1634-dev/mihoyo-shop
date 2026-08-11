"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAccessToken } from "@/lib/auth";
import { formatPrice } from "@/lib/config";

type DashboardStats = {
  total_orders: number;
  paid_orders: number;
  pending_orders: number;
  failed_orders: number;
  total_revenue: number;
  available_products: number;
  sold_products: number;
  registered_users: number;
  guest_orders: number;
  active_coupons: number;
  total_coupon_uses: number;
  total_affiliates: number;
  total_referrals: number;
};

function StatCard({ label, value, sub, color = "text-white" }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      const res = await fetch("/api/admin/stats", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setStats(await res.json() as DashboardStats);
      setLoading(false);
    })();
  }, []);

  const navLinks = [
    { href: "/admin/orders", label: "Orders" },
    { href: "/admin/products", label: "Products" },
    { href: "/admin/games", label: "Games" },
    { href: "/admin/coupons", label: "Coupons" },
    { href: "/admin/analytics", label: "Analytics" },
    { href: "/admin/reviews", label: "Reviews" },
    { href: "/admin/affiliates", label: "Affiliates" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-2xl font-bold sm:text-3xl">Admin Dashboard</h1>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {navLinks.map(l => (
              <Link key={l.href} href={l.href}
                className="rounded-xl border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl border border-slate-800 bg-slate-900 animate-pulse" />
            ))}
          </div>
        ) : !stats ? (
          <div className="text-slate-400">Failed to load stats.</div>
        ) : (
          <>
            {/* Revenue */}
            <div className="mb-6">
              <h2 className="mb-3 text-lg font-semibold text-slate-300">Revenue</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard label="Total Revenue (Paid)" value={formatPrice(stats.total_revenue)} color="text-green-400" />
                <StatCard label="Total Orders" value={stats.total_orders} />
                <StatCard label="Guest Orders" value={stats.guest_orders} />
              </div>
            </div>

            {/* Order status */}
            <div className="mb-6">
              <h2 className="mb-3 text-lg font-semibold text-slate-300">Orders by Status</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Paid" value={stats.paid_orders} color="text-green-400" />
                <StatCard label="Pending" value={stats.pending_orders} color="text-yellow-400" />
                <StatCard label="Failed" value={stats.failed_orders} color="text-red-400" />
              </div>
            </div>

            {/* Products */}
            <div className="mb-6">
              <h2 className="mb-3 text-lg font-semibold text-slate-300">Inventory</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard label="Available Products" value={stats.available_products} color="text-blue-400" />
                <StatCard label="Sold Products" value={stats.sold_products} />
              </div>
            </div>

            {/* Users */}
            <div className="mb-6">
              <h2 className="mb-3 text-lg font-semibold text-slate-300">Users & Affiliates</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Registered Users" value={stats.registered_users} />
                <StatCard label="Active Coupons" value={stats.active_coupons} />
                <StatCard label="Coupon Uses" value={stats.total_coupon_uses} />
                <StatCard label="Referrals" value={stats.total_referrals} sub={`${stats.total_affiliates} affiliates`} />
              </div>
            </div>

            {/* Quick links */}
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <Link href="/admin/orders?filter=pending"
                className="rounded-2xl border border-yellow-900/50 bg-yellow-950/20 p-4 hover:bg-yellow-950/40">
                <p className="font-semibold text-yellow-400">Pending Orders →</p>
                <p className="text-2xl font-bold">{stats.pending_orders}</p>
              </Link>
              <Link href="/admin/products?status=available"
                className="rounded-2xl border border-blue-900/50 bg-blue-950/20 p-4 hover:bg-blue-950/40">
                <p className="font-semibold text-blue-400">Available Products →</p>
                <p className="text-2xl font-bold">{stats.available_products}</p>
              </Link>
              <Link href="/admin/analytics"
                className="rounded-2xl border border-slate-700 bg-slate-900 p-4 hover:bg-slate-800">
                <p className="font-semibold text-slate-300">View Analytics →</p>
                <p className="text-sm text-slate-400 mt-1">Sales charts & trends</p>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
