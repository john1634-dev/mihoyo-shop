"use client";

import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/auth";
import { formatPrice } from "@/lib/config";

type DaySales = {
  day: string;
  order_count: number;
  paid_count: number;
  pending_count: number;
  failed_count: number;
  revenue: number;
};

type AnalyticsData = {
  range: string;
  sales: DaySales[];
  topGames: { name: string; count: number }[];
};

const RANGES = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "all", label: "All Time" },
];

function SimpleBarChart({ data, valueKey, labelKey, color = "bg-blue-600" }: {
  data: Record<string, unknown>[];
  valueKey: string;
  labelKey: string;
  color?: string;
}) {
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-right text-xs text-slate-400 truncate">
            {String(d[labelKey])}
          </span>
          <div className="flex-1 rounded-full bg-slate-800 h-4 overflow-hidden">
            <div
              className={`h-full ${color} rounded-full transition-all`}
              style={{ width: `${(Number(d[valueKey]) / max) * 100}%` }}
            />
          </div>
          <span className="w-16 text-xs text-slate-300">{String(d[valueKey])}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [range, setRange] = useState("30d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function run() {
      setLoading(true);
      const token = await getAccessToken();
      const res = await fetch(`/api/admin/analytics?range=${range}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!active) return;
      if (res.ok) setData(await res.json() as AnalyticsData);
      setLoading(false);
    }
    void run();
    return () => { active = false; };
  }, [range]);

  const totalRevenue = data?.sales.reduce((s, d) => s + Number(d.revenue), 0) ?? 0;
  const totalOrders = data?.sales.reduce((s, d) => s + Number(d.order_count), 0) ?? 0;
  const totalPaid = data?.sales.reduce((s, d) => s + Number(d.paid_count), 0) ?? 0;
  const avgOrder = totalPaid > 0 ? totalRevenue / totalPaid : 0;

  const revenueChartData = (data?.sales ?? []).map(d => ({
    label: new Date(d.day).toLocaleDateString("en-MY", { month: "short", day: "numeric" }),
    revenue: Number(d.revenue).toFixed(2),
  }));

  const orderChartData = (data?.sales ?? []).map(d => ({
    label: new Date(d.day).toLocaleDateString("en-MY", { month: "short", day: "numeric" }),
    orders: d.paid_count,
  }));

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <a href="/admin" className="text-sm text-slate-400 hover:text-white">← Dashboard</a>
            <h1 className="mt-1 text-2xl font-bold">Sales Analytics</h1>
          </div>
          <div className="flex gap-2 flex-wrap">
            {RANGES.map(r => (
              <button key={r.value} onClick={() => setRange(r.value)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${range === r.value ? "bg-blue-600" : "border border-slate-700 hover:bg-slate-800"}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl border border-slate-800 bg-slate-900 animate-pulse" />
            ))}
          </div>
        ) : !data ? (
          <div className="text-slate-400">Failed to load analytics.</div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">Revenue</p>
                <p className="mt-1 text-2xl font-bold text-green-400">{formatPrice(totalRevenue)}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">Total Orders</p>
                <p className="mt-1 text-2xl font-bold">{totalOrders}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">Paid Orders</p>
                <p className="mt-1 text-2xl font-bold text-green-400">{totalPaid}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">Avg Order Value</p>
                <p className="mt-1 text-2xl font-bold">{formatPrice(avgOrder)}</p>
              </div>
            </div>

            {/* Revenue chart */}
            {revenueChartData.length > 0 && (
              <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="mb-4 font-semibold">Revenue by Day</h2>
                <SimpleBarChart data={revenueChartData} valueKey="revenue" labelKey="label" color="bg-green-600" />
              </div>
            )}

            {/* Orders chart */}
            {orderChartData.length > 0 && (
              <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="mb-4 font-semibold">Paid Orders by Day</h2>
                <SimpleBarChart data={orderChartData} valueKey="orders" labelKey="label" color="bg-blue-600" />
              </div>
            )}

            <div className="grid gap-6 sm:grid-cols-2">
              {/* Top games */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="mb-4 font-semibold">Top Games (All Time)</h2>
                {data.topGames.length === 0 ? (
                  <p className="text-slate-400 text-sm">No data yet.</p>
                ) : (
                  <SimpleBarChart
                    data={data.topGames.map(g => ({ label: g.name, count: g.count }))}
                    valueKey="count" labelKey="label" color="bg-purple-600" />
                )}
              </div>

              {/* Status breakdown table */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="mb-4 font-semibold">Status Breakdown</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="pb-2">Date</th>
                      <th className="pb-2 text-right">Paid</th>
                      <th className="pb-2 text-right">Pending</th>
                      <th className="pb-2 text-right">Failed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {data.sales.slice(0, 10).map(d => (
                      <tr key={d.day}>
                        <td className="py-1.5 text-slate-400 text-xs">
                          {new Date(d.day).toLocaleDateString("en-MY", { month: "short", day: "numeric" })}
                        </td>
                        <td className="py-1.5 text-right text-green-400">{d.paid_count}</td>
                        <td className="py-1.5 text-right text-yellow-400">{d.pending_count}</td>
                        <td className="py-1.5 text-right text-red-400">{d.failed_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
