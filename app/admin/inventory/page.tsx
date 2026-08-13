"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { adminFetch } from "@/lib/admin-api";
import { supabase } from "@/lib/supabase";
import {
  INVENTORY_STATUSES,
  type InventoryItemPublic,
  type InventoryStatus,
} from "@/lib/inventory";

type ProductOption = {
  id: string;
  title: string;
};

const EMPTY_FORM = {
  product_id: "",
  label: "",
  game_uid_hint: "",
  notes_internal: "",
  login: "",
  email: "",
  password: "",
  extra: "",
};

function statusClass(status: InventoryStatus): string {
  switch (status) {
    case "available":
      return "bg-emerald-500/10 text-emerald-400";
    case "reserved":
      return "bg-amber-500/10 text-amber-400";
    case "assigned":
      return "bg-blue-500/10 text-blue-400";
    case "delivered":
      return "bg-cyan-500/10 text-cyan-400";
    case "consumed":
      return "bg-slate-700 text-slate-300";
    case "void":
      return "bg-red-500/10 text-red-400";
    default:
      return "bg-slate-800 text-slate-400";
  }
}

export default function AdminInventoryPage() {
  const [items, setItems] = useState<InventoryItemPublic[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [productFilter, setProductFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busyId, setBusyId] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editDraft, setEditDraft] = useState({
    label: "",
    game_uid_hint: "",
    notes_internal: "",
  });
  const [, startTransition] = useTransition();

  const loadProducts = useCallback(async () => {
    const result = await supabase
      .from("products")
      .select("id,title")
      .order("title", { ascending: true });

    if (!result.error) {
      setProducts(result.data || []);
    }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (productFilter !== "all") params.set("product_id", productFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const query = params.toString();
      const res = await adminFetch(
        `/api/admin/inventory${query ? `?${query}` : ""}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to load inventory.");
      }

      setItems((data.items || []) as InventoryItemPublic[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  }, [productFilter, statusFilter]);

  useEffect(() => {
    startTransition(() => {
      void loadProducts();
    });
  }, [loadProducts, startTransition]);

  useEffect(() => {
    startTransition(() => {
      void loadItems();
    });
  }, [loadItems, startTransition]);

  const filteredCount = useMemo(() => items.length, [items]);

  async function createItem(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await adminFetch("/api/admin/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to add account.");
      }

      setForm(EMPTY_FORM);
      setShowAddForm(false);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add account.");
    } finally {
      setSaving(false);
    }
  }

  async function voidItem(id: string) {
    if (!window.confirm("Void this inventory unit? This cannot be undone.")) {
      return;
    }

    setBusyId(id);
    setError("");

    try {
      const res = await adminFetch("/api/admin/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, void: true }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Void failed.");
      }

      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Void failed.");
    } finally {
      setBusyId("");
    }
  }

  function startEdit(item: InventoryItemPublic) {
    setEditingId(item.id);
    setEditDraft({
      label: item.label || "",
      game_uid_hint: item.game_uid_hint || "",
      notes_internal: item.notes_internal || "",
    });
  }

  async function saveEdit(id: string) {
    setBusyId(id);
    setError("");

    try {
      const res = await adminFetch("/api/admin/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          label: editDraft.label,
          game_uid_hint: editDraft.game_uid_hint,
          notes_internal: editDraft.notes_internal,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Update failed.");
      }

      setEditingId("");
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="mt-1 text-sm text-slate-400">
            Game-account stock units. Credentials are encrypted server-side and
            never shown in this list.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void loadItems()} className="btn-secondary">
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowAddForm((open) => !open)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
          >
            {showAddForm ? "Close form" : "Add Account"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-900/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {showAddForm && (
        <form
          onSubmit={(event) => void createItem(event)}
          className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
        >
          <h2 className="text-lg font-semibold">Add Account</h2>
          <p className="mt-1 text-xs text-slate-400">
            Login credentials are encrypted before storage. Do not put passwords
            in internal notes.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block text-xs text-slate-400 md:col-span-2">
              Product
              <select
                required
                value={form.product_id}
                onChange={(e) =>
                  setForm((current) => ({ ...current, product_id: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="">Select product…</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-slate-400">
              Label
              <input
                value={form.label}
                onChange={(e) =>
                  setForm((current) => ({ ...current, label: e.target.value }))
                }
                placeholder="Optional internal label"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-xs text-slate-400">
              UID hint
              <input
                value={form.game_uid_hint}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    game_uid_hint: e.target.value,
                  }))
                }
                placeholder="Masked UID hint only"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-xs text-slate-400 md:col-span-2">
              Internal notes (no passwords)
              <textarea
                value={form.notes_internal}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    notes_internal: e.target.value,
                  }))
                }
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-xs text-slate-400">
              Login
              <input
                required
                autoComplete="off"
                value={form.login}
                onChange={(e) =>
                  setForm((current) => ({ ...current, login: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-xs text-slate-400">
              Email
              <input
                type="email"
                autoComplete="off"
                value={form.email}
                onChange={(e) =>
                  setForm((current) => ({ ...current, email: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-xs text-slate-400">
              Password
              <input
                required
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) =>
                  setForm((current) => ({ ...current, password: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-xs text-slate-400">
              Extra
              <input
                autoComplete="off"
                value={form.extra}
                onChange={(e) =>
                  setForm((current) => ({ ...current, extra: e.target.value }))
                }
                placeholder="Optional recovery info"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save encrypted account"}
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm"
        >
          <option value="all">All products</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.title}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm"
        >
          <option value="all">All statuses</option>
          {INVENTORY_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="mt-8 animate-pulse space-y-3">
          <div className="h-20 rounded-2xl bg-slate-900" />
          <div className="h-20 rounded-2xl bg-slate-900" />
        </div>
      ) : filteredCount === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-slate-400">
          No inventory items match these filters.
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full min-w-[960px]">
            <thead className="bg-slate-900">
              <tr className="border-b border-slate-800 text-left text-sm text-slate-400">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">UID hint</th>
                <th className="px-4 py-3">Internal notes</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const editing = editingId === item.id;
                const canVoid =
                  item.status === "available" && !item.order_id && !editing;
                const canEdit =
                  item.status !== "void" && item.status !== "consumed";

                return (
                  <tr
                    key={item.id}
                    className="border-b border-slate-800 align-top hover:bg-slate-900/60"
                  >
                    <td className="px-4 py-4">
                      <p className="font-medium">
                        {item.product_title || item.product_id.slice(0, 8)}
                      </p>
                      <p className="mt-1 font-mono text-xs text-slate-500">
                        {item.id.slice(0, 8)}…
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs capitalize ${statusClass(item.status)}`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-300">
                      {editing ? (
                        <input
                          value={editDraft.label}
                          onChange={(e) =>
                            setEditDraft((current) => ({
                              ...current,
                              label: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                        />
                      ) : (
                        item.label || "—"
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-300">
                      {editing ? (
                        <input
                          value={editDraft.game_uid_hint}
                          onChange={(e) =>
                            setEditDraft((current) => ({
                              ...current,
                              game_uid_hint: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                        />
                      ) : (
                        item.game_uid_hint || "—"
                      )}
                    </td>
                    <td className="max-w-xs px-4 py-4 text-sm text-slate-300">
                      {editing ? (
                        <textarea
                          value={editDraft.notes_internal}
                          onChange={(e) =>
                            setEditDraft((current) => ({
                              ...current,
                              notes_internal: e.target.value,
                            }))
                          }
                          rows={2}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                        />
                      ) : (
                        item.notes_internal || "—"
                      )}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-slate-400">
                      {item.order_id ? `${item.order_id.slice(0, 8)}…` : "—"}
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-400">
                      {new Date(item.created_at).toLocaleString("en-MY")}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        {canEdit && !editing && (
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs hover:border-blue-500"
                          >
                            Edit
                          </button>
                        )}
                        {editing && (
                          <>
                            <button
                              type="button"
                              disabled={busyId === item.id}
                              onClick={() => void saveEdit(item.id)}
                              className="rounded-lg border border-blue-500/40 px-2.5 py-1.5 text-xs text-blue-300 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId("")}
                              className="rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {canVoid && (
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => void voidItem(item.id)}
                            className="rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs text-red-300 hover:border-red-400 disabled:opacity-50"
                          >
                            Void
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
