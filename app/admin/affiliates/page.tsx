"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type AffiliateRow = {
  id: string;
  user_id: string;
  referral_code: string;
  is_active: boolean;
  created_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
  referral_count: number;
};

export default function AdminAffiliatesPage() {
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: affData } = await supabase
        .from("affiliates")
        .select("*, profiles(full_name, email)")
        .order("created_at", { ascending: false });

      if (!affData) { setLoading(false); return; }

      // fetch referral counts
      const ids = affData.map(a => a.id as string);
      const { data: refData } = await supabase
        .from("referrals")
        .select("affiliate_id")
        .in("affiliate_id", ids);

      const countMap: Record<string, number> = {};
      for (const r of refData ?? []) countMap[r.affiliate_id as string] = (countMap[r.affiliate_id as string] ?? 0) + 1;

      setAffiliates(affData.map(a => ({ ...a, referral_count: countMap[a.id as string] ?? 0 })) as AffiliateRow[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <a href="/admin" className="text-sm text-slate-400 hover:text-white">← Dashboard</a>
          <h1 className="mt-1 text-2xl font-bold">Affiliates & Referrals</h1>
        </div>

        {loading ? (
          <div className="text-slate-400">Loading…</div>
        ) : affiliates.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-400">
            No affiliates yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800 bg-slate-900 text-left text-slate-400">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Referrals</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950">
                {affiliates.map(a => (
                  <tr key={a.id} className="hover:bg-slate-900/50">
                    <td className="px-4 py-3">
                      <p className="font-medium">{a.profiles?.full_name ?? "—"}</p>
                      <p className="text-xs text-slate-400">{a.profiles?.email ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-blue-400">{a.referral_code}</td>
                    <td className="px-4 py-3 font-semibold">{a.referral_count}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${a.is_active ? "bg-green-900/40 text-green-400" : "bg-slate-800 text-slate-400"}`}>
                        {a.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {new Date(a.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
