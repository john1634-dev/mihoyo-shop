"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/admin-api";

type DashboardStats = {
  total_products: number;
  available_products: number;
  sold_products: number;
  total_games: number;
};

function StatCard({
  label,
  value,
  href,
  accent = "text-white",
}: {
  label: string;
  value: number;
  href?: string;
  accent?: string;
}) {
  const content = (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 transition hover:border-slate-700">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-bold tracking-tight ${accent}`}>
        {value}
      </p>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function run() {
      setLoading(true);
      setError("");

      try {
        const res = await adminFetch("/api/admin/stats", {
          cache: "no-store",
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to load dashboard.");
        }

        if (active) {
          setStats(data as DashboardStats);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load dashboard."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold sm:text-3xl">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-400">
          Catalogue overview for games and accounts.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-slate-800 bg-slate-900"
            />
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Products"
              value={stats.total_products}
              href="/admin/products"
            />
            <StatCard
              label="Available"
              value={stats.available_products}
              href="/admin/products"
              accent="text-emerald-400"
            />
            <StatCard
              label="Sold"
              value={stats.sold_products}
              href="/admin/products"
              accent="text-slate-300"
            />
            <StatCard
              label="Games"
              value={stats.total_games}
              href="/admin/games"
              accent="text-blue-400"
            />
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <Link
              href="/admin/products/new"
              className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-5 transition hover:bg-blue-500/15"
            >
              <p className="font-semibold text-blue-300">Add product →</p>
              <p className="mt-1 text-sm text-slate-400">
                Create a new account listing
              </p>
            </Link>
            <Link
              href="/admin/games"
              className="rounded-2xl border border-slate-700 bg-slate-900 p-5 transition hover:border-slate-600"
            >
              <p className="font-semibold">Manage games →</p>
              <p className="mt-1 text-sm text-slate-400">
                Categories, images, sort order
              </p>
            </Link>
            <Link
              href="/products"
              className="rounded-2xl border border-slate-700 bg-slate-900 p-5 transition hover:border-slate-600"
            >
              <p className="font-semibold">View storefront →</p>
              <p className="mt-1 text-sm text-slate-400">
                Open the public catalogue
              </p>
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
