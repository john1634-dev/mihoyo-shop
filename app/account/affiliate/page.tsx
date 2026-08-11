"use client";

import { useEffect, useState } from "react";
import AccountGuard from "@/components/AccountGuard";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getAccessToken } from "@/lib/auth";
import { SITE_URL } from "@/lib/config";

type AffiliateData = {
  id: string;
  referral_code: string;
  is_active: boolean;
  created_at: string;
  referred_count: number;
};

export default function AffiliatePage() {
  const [data, setData] = useState<AffiliateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      const res = await fetch("/api/affiliate", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setData(await res.json() as AffiliateData);
      setLoading(false);
    })();
  }, []);

  const referralUrl = data ? `${SITE_URL}/register?ref=${data.referral_code}` : "";

  function copy() {
    if (!referralUrl) return;
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AccountGuard>
      <main className="flex min-h-screen flex-col bg-slate-950 text-white">
        <Navbar />

        <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 md:px-6">
          <h1 className="text-3xl font-bold">Referral Program</h1>
          <p className="mt-2 text-slate-400">Share your link and track referrals</p>

          {loading ? (
            <p className="mt-10 text-slate-400">Loading…</p>
          ) : !data ? (
            <p className="mt-10 text-slate-400">Could not load affiliate data.</p>
          ) : (
            <div className="mt-10 space-y-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="mb-4 font-semibold text-white">Your Referral Code</h2>
                <div className="flex items-center gap-3">
                  <span className="rounded-xl border border-blue-700 bg-blue-950/40 px-6 py-3 font-mono text-2xl font-bold tracking-widest text-blue-400">
                    {data.referral_code}
                  </span>
                </div>
                <div className="mt-4">
                  <label className="mb-1 block text-sm text-slate-400">Referral Link</label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={referralUrl}
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
                    />
                    <button
                      onClick={copy}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500">
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="mb-4 font-semibold text-white">Statistics</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-center">
                    <p className="text-3xl font-bold text-blue-400">{data.referred_count}</p>
                    <p className="mt-1 text-sm text-slate-400">Users Referred</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-center">
                    <p className={`text-lg font-bold ${data.is_active ? "text-green-400" : "text-red-400"}`}>
                      {data.is_active ? "Active" : "Inactive"}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">Program Status</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="mb-2 font-semibold text-white">How It Works</h2>
                <ol className="mt-3 space-y-2 text-sm text-slate-400 list-decimal list-inside">
                  <li>Share your referral link with friends.</li>
                  <li>When they register using your link, they are tracked as your referral.</li>
                  <li>Commission payouts are not yet automated — contact admin.</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        <Footer />
      </main>
    </AccountGuard>
  );
}
