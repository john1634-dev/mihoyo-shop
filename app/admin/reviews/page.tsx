"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getAccessToken } from "@/lib/auth";

type Review = {
  id: string;
  rating: number;
  body: string | null;
  is_hidden: boolean;
  created_at: string;
  user_id: string;
  product_id: string;
  profiles: { full_name: string | null; email: string | null } | null;
  products: { title: string | null } | null;
};

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    const { data } = await supabase
      .from("reviews")
      .select("*, profiles(full_name, email), products(title)")
      .order("created_at", { ascending: false });
    setReviews((data ?? []) as Review[]);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    async function run() {
      const { data } = await supabase
        .from("reviews")
        .select("*, profiles(full_name, email), products(title)")
        .order("created_at", { ascending: false });
      if (!active) return;
      setReviews((data ?? []) as Review[]);
      setLoading(false);
    }
    void run();
    return () => { active = false; };
  }, []);

  async function toggleHide(r: Review) {
    const token = await getAccessToken();
    await fetch(`/api/reviews/${r.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ is_hidden: !r.is_hidden }),
    });
    void reload();
  }

  async function deleteReview(r: Review) {
    if (!confirm("Delete this review permanently?")) return;
    const token = await getAccessToken();
    await fetch(`/api/reviews/${r.id}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    void reload();
  }

  const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <a href="/admin" className="text-sm text-slate-400 hover:text-white">← Dashboard</a>
          <h1 className="mt-1 text-2xl font-bold">Reviews</h1>
        </div>

        {loading ? (
          <div className="text-slate-400">Loading…</div>
        ) : reviews.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-400">
            No reviews yet.
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map(r => (
              <div key={r.id}
                className={`rounded-2xl border p-4 ${r.is_hidden ? "border-slate-800 bg-slate-900/40 opacity-60" : "border-slate-800 bg-slate-900"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-yellow-400 text-sm">{stars(r.rating)}</span>
                      <span className="text-slate-400 text-xs">
                        {r.profiles?.full_name ?? r.profiles?.email ?? "Unknown user"}
                      </span>
                      <span className="text-slate-600 text-xs">
                        {r.products?.title ?? "Unknown product"}
                      </span>
                      <span className="text-slate-600 text-xs">
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                      {r.is_hidden && (
                        <span className="rounded-full bg-red-900/40 px-2 py-0.5 text-xs text-red-400">Hidden</span>
                      )}
                    </div>
                    {r.body && <p className="mt-2 text-sm text-slate-300">{r.body}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => toggleHide(r)}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800">
                      {r.is_hidden ? "Show" : "Hide"}
                    </button>
                    <button onClick={() => deleteReview(r)}
                      className="rounded-lg border border-red-900/50 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/40">
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
