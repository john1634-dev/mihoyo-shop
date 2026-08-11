"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatPrice } from "@/lib/config";

type Coupon = {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  min_order_amount: number;
  max_uses: number | null;
  max_uses_per_user: number | null;
  current_uses: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

const EMPTY: Omit<Coupon, "id" | "current_uses" | "created_at"> = {
  code: "",
  description: "",
  discount_type: "percentage",
  discount_value: 10,
  min_order_amount: 0,
  max_uses: null,
  max_uses_per_user: null,
  starts_at: null,
  expires_at: null,
  is_active: true,
};

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function reload() {
    setLoading(true);
    const { data, error: err } = await supabase
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false });
    if (err) setError(err.message);
    else setCoupons((data ?? []) as Coupon[]);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    async function run() {
      const { data, error: err } = await supabase
        .from("coupons")
        .select("*")
        .order("created_at", { ascending: false });
      if (!active) return;
      if (err) setError(err.message);
      else setCoupons((data ?? []) as Coupon[]);
      setLoading(false);
    }
    void run();
    return () => { active = false; };
  }, []);

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY });
    setSaveError("");
    setShowForm(true);
  }

  function openEdit(c: Coupon) {
    setEditing(c);
    setForm({
      code: c.code,
      description: c.description ?? "",
      discount_type: c.discount_type,
      discount_value: c.discount_value,
      min_order_amount: c.min_order_amount,
      max_uses: c.max_uses,
      max_uses_per_user: c.max_uses_per_user,
      starts_at: c.starts_at ? c.starts_at.slice(0, 16) : null,
      expires_at: c.expires_at ? c.expires_at.slice(0, 16) : null,
      is_active: c.is_active,
    });
    setSaveError("");
    setShowForm(true);
  }

  async function save() {
    setSaving(true);
    setSaveError("");
    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description || null,
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      min_order_amount: Number(form.min_order_amount),
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      max_uses_per_user: form.max_uses_per_user ? Number(form.max_uses_per_user) : null,
      starts_at: form.starts_at || null,
      expires_at: form.expires_at || null,
      is_active: form.is_active,
    };
    if (!payload.code) { setSaveError("Code is required."); setSaving(false); return; }
    if (payload.discount_value <= 0) { setSaveError("Discount value must be > 0."); setSaving(false); return; }

    let err;
    if (editing) {
      ({ error: err } = await supabase.from("coupons").update(payload).eq("id", editing.id));
    } else {
      ({ error: err } = await supabase.from("coupons").insert(payload));
    }
    setSaving(false);
    if (err) { setSaveError(err.message); return; }
    setShowForm(false);
    void reload();
  }

  async function toggleActive(c: Coupon) {
    await supabase.from("coupons").update({ is_active: !c.is_active }).eq("id", c.id);
    void reload();
  }

  async function deleteCoupon(c: Coupon) {
    if (!confirm(`Delete coupon "${c.code}"? This cannot be undone.`)) return;
    await supabase.from("coupons").delete().eq("id", c.id);
    void reload();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <a href="/admin" className="text-sm text-slate-400 hover:text-white">← Admin</a>
            <h1 className="mt-1 text-2xl font-bold">Coupons</h1>
          </div>
          <button onClick={openNew} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-500">
            + New Coupon
          </button>
        </div>

        {error && <div className="mb-4 rounded-xl bg-red-950/40 border border-red-900 p-4 text-red-400">{error}</div>}

        {/* Form modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="mb-4 text-xl font-bold">{editing ? "Edit Coupon" : "New Coupon"}</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">Code *</label>
                    <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono uppercase"
                      placeholder="SAVE10" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">Status</label>
                    <select value={form.is_active ? "1" : "0"} onChange={e => setForm(f => ({ ...f, is_active: e.target.value === "1" }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
                      <option value="1">Active</option>
                      <option value="0">Inactive</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-400">Description</label>
                  <input value={form.description ?? ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    placeholder="Optional description" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">Type</label>
                    <select value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value as "percentage" | "fixed" }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed (MYR)</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">
                      Value {form.discount_type === "percentage" ? "(%)" : "(MYR)"}
                    </label>
                    <input type="number" min="0.01" step="0.01" value={form.discount_value}
                      onChange={e => setForm(f => ({ ...f, discount_value: Number(e.target.value) }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">Min Order (MYR)</label>
                    <input type="number" min="0" step="0.01" value={form.min_order_amount}
                      onChange={e => setForm(f => ({ ...f, min_order_amount: Number(e.target.value) }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">Total Uses Limit</label>
                    <input type="number" min="1" value={form.max_uses ?? ""}
                      onChange={e => setForm(f => ({ ...f, max_uses: e.target.value ? Number(e.target.value) : null }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      placeholder="Unlimited" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">Per-User Limit</label>
                    <input type="number" min="1" value={form.max_uses_per_user ?? ""}
                      onChange={e => setForm(f => ({ ...f, max_uses_per_user: e.target.value ? Number(e.target.value) : null }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      placeholder="Unlimited" />
                  </div>
                  <div />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">Starts At</label>
                    <input type="datetime-local" value={form.starts_at ?? ""}
                      onChange={e => setForm(f => ({ ...f, starts_at: e.target.value || null }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">Expires At</label>
                    <input type="datetime-local" value={form.expires_at ?? ""}
                      onChange={e => setForm(f => ({ ...f, expires_at: e.target.value || null }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
                  </div>
                </div>
                {saveError && <p className="text-sm text-red-400">{saveError}</p>}
                <div className="flex gap-3 pt-2">
                  <button onClick={save} disabled={saving}
                    className="flex-1 rounded-xl bg-blue-600 py-2 font-semibold hover:bg-blue-500 disabled:opacity-50">
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => setShowForm(false)}
                    className="flex-1 rounded-xl border border-slate-700 py-2 hover:bg-slate-800">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-slate-400">Loading…</div>
        ) : coupons.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-400">
            No coupons yet. Create one to get started.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800 bg-slate-900 text-left text-slate-400">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Type / Value</th>
                  <th className="px-4 py-3">Min Order</th>
                  <th className="px-4 py-3">Uses</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950">
                {coupons.map(c => (
                  <tr key={c.id} className="hover:bg-slate-900/50">
                    <td className="px-4 py-3 font-mono font-semibold">{c.code}</td>
                    <td className="px-4 py-3">
                      {c.discount_type === "percentage"
                        ? `${c.discount_value}%`
                        : formatPrice(c.discount_value)}
                    </td>
                    <td className="px-4 py-3">
                      {c.min_order_amount > 0 ? formatPrice(c.min_order_amount) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {c.current_uses}{c.max_uses ? ` / ${c.max_uses}` : ""}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.is_active ? "bg-green-900/40 text-green-400" : "bg-slate-800 text-slate-400"}`}>
                        {c.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(c)} className="text-blue-400 hover:text-blue-300">Edit</button>
                        <button onClick={() => toggleActive(c)} className="text-slate-400 hover:text-white">
                          {c.is_active ? "Disable" : "Enable"}
                        </button>
                        <button onClick={() => deleteCoupon(c)} className="text-red-400 hover:text-red-300">Delete</button>
                      </div>
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
