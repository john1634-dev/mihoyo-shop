"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/admin-api";
import { formatPrice } from "@/lib/config";
import {
  type ProductStockSummary,
} from "@/lib/inventory-stock";
import { ProductStockBadge } from "@/components/admin/ProductStockSummary";
import { supabase } from "@/lib/supabase";
import {
  INVENTORY_STATUSES,
  type InventoryItemPublic,
  type InventoryStatus,
} from "@/lib/inventory";

type ProductOption = {
  id: string;
  title: string;
  price?: number;
  currency?: string;
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

function readInitialInventoryFilters(): {
  productFilter: string;
  statusFilter: string;
  formProductId: string;
  openAddForm: boolean;
} {
  if (typeof window === "undefined") {
    return {
      productFilter: "all",
      statusFilter: "all",
      formProductId: "",
      openAddForm: false,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const productId = params.get("product_id")?.trim() || "";
  const status = params.get("status")?.trim() || "";

  if (!productId) {
    return {
      productFilter: "all",
      statusFilter: "all",
      formProductId: "",
      openAddForm: false,
    };
  }

  return {
    productFilter: productId,
    statusFilter: status || "available",
    formProductId: productId,
    openAddForm: true,
  };
}

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
  const initialFilters = readInitialInventoryFilters();
  const [items, setItems] = useState<InventoryItemPublic[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
  const [stockSummary, setStockSummary] = useState<ProductStockSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [productFilter, setProductFilter] = useState(initialFilters.productFilter);
  const [statusFilter, setStatusFilter] = useState(initialFilters.statusFilter);
  const [showAddForm, setShowAddForm] = useState(initialFilters.openAddForm);
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    product_id: initialFilters.formProductId,
  });
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
      .select("id,title,price,currency")
      .order("title", { ascending: true });

    if (!result.error) {
      setProducts((result.data || []) as ProductOption[]);
    }
  }, []);

  const loadStockSummary = useCallback(async (productId: string) => {
    if (productId === "all") {
      setStockSummary(null);
      setSelectedProduct(null);
      return;
    }

    const product = products.find((p) => p.id === productId);
    if (product) setSelectedProduct(product);

    try {
      const res = await adminFetch(
        `/api/admin/inventory/stock?product_id=${encodeURIComponent(productId)}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.summary) {
        setStockSummary(data.summary as ProductStockSummary);
      } else {
        setStockSummary(null);
      }
    } catch {
      setStockSummary(null);
    }
  }, [products]);

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
      if (productFilter !== "all") {
        void loadStockSummary(productFilter);
      }
    });
  }, [loadItems, loadStockSummary, productFilter, startTransition]);

  const filteredCount = useMemo(() => items.length, [items]);

  async function refreshAll() {
    await Promise.all([loadItems(), loadStockSummary(productFilter)]);
  }

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

      setForm((current) => ({
        ...EMPTY_FORM,
        product_id: productFilter !== "all" ? productFilter : current.product_id,
      }));
      await refreshAll();
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

      await refreshAll();
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
    <div className="mx-auto min-w-0 max-w-7xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/products" className="text-sm text-slate-400 hover:text-white">
            ← Products
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="mt-1 text-sm text-slate-400">
            One row = one encrypted account unit. Credentials never appear here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void refreshAll()} className="btn-secondary min-h-11">
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowAddForm((open) => !open)}
            className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
          >
            {showAddForm ? "Close form" : "+ Add Account"}
          </button>
        </div>
      </div>

      {selectedProduct && stockSummary && (
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link
                href={`/admin/products/${selectedProduct.id}/edit`}
                className="text-lg font-semibold hover:text-blue-300"
              >
                {selectedProduct.title}
              </Link>
              {selectedProduct.price != null && (
                <p className="mt-1 text-sm text-slate-300">
                  {formatPrice(Number(selectedProduct.price), selectedProduct.currency || "MYR")}
                </p>
              )}
            </div>
            <ProductStockBadge availableCount={stockSummary.available_count} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-slate-500">Available</dt>
              <dd className="mt-1 font-semibold tabular-nums">{stockSummary.available_count}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Assigned</dt>
              <dd className="mt-1 font-semibold tabular-nums">{stockSummary.assigned_count}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Delivered</dt>
              <dd className="mt-1 font-semibold tabular-nums">{stockSummary.delivered_count}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Total</dt>
              <dd className="mt-1 font-semibold tabular-nums">{stockSummary.total_count}</dd>
            </div>
          </dl>
        </section>
      )}

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
            Each submission creates one inventory unit with encrypted credentials.
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
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"
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
              Login
              <input
                required
                autoComplete="off"
                value={form.login}
                onChange={(e) =>
                  setForm((current) => ({ ...current, login: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"
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
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"
              />
            </label>

            <label className="block text-xs text-slate-400">
              Account Email
              <input
                type="email"
                autoComplete="off"
                value={form.email}
                onChange={(e) =>
                  setForm((current) => ({ ...current, email: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"
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
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"
              />
            </label>

            <label className="block text-xs text-slate-400">
              Label
              <input
                value={form.label}
                onChange={(e) =>
                  setForm((current) => ({ ...current, label: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"
              />
            </label>

            <label className="block text-xs text-slate-400">
              Game UID Hint
              <input
                value={form.game_uid_hint}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    game_uid_hint: e.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"
              />
            </label>

            <label className="block text-xs text-slate-400 md:col-span-2">
              Internal Notes (no passwords)
              <textarea
                value={form.notes_internal}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    notes_internal: e.target.value,
                  }))
                }
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-4 min-h-11 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium hover:bg-blue-500 disabled:opacity-50 sm:w-auto"
          >
            {saving ? "Adding…" : "Add Account"}
          </button>
        </form>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="min-h-11 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm"
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
          className="min-h-11 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm"
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
          <div className="h-24 rounded-2xl bg-slate-900" />
          <div className="h-24 rounded-2xl bg-slate-900" />
        </div>
      ) : filteredCount === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-slate-400">
          {statusFilter === "available"
            ? "No available accounts for these filters."
            : "No inventory accounts yet."}
        </div>
      ) : (
        <>
          <div className="mt-8 hidden overflow-hidden rounded-2xl border border-slate-800 lg:block">
            <table className="w-full">
              <thead className="bg-slate-900">
                <tr className="border-b border-slate-800 text-left text-sm text-slate-400">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3">Delivered</th>
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
                      <td className="px-4 py-4 font-mono text-xs text-slate-400">
                        {item.id.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-4">
                        <Link
                          href={`/admin/products/${item.product_id}/edit`}
                          className="font-medium hover:text-blue-300"
                        >
                          {item.product_title || "Product"}
                        </Link>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs capitalize ${statusClass(item.status)}`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-400">
                        {new Date(item.created_at).toLocaleString("en-MY")}
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-400">
                        {item.assigned_at
                          ? new Date(item.assigned_at).toLocaleString("en-MY")
                          : "—"}
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-400">
                        {item.delivered_at
                          ? new Date(item.delivered_at).toLocaleString("en-MY")
                          : "—"}
                      </td>
                      <td className="px-4 py-4">
                        <InventoryItemActions
                          item={item}
                          editing={editing}
                          canEdit={canEdit}
                          canVoid={canVoid}
                          busyId={busyId}
                          editDraft={editDraft}
                          setEditDraft={setEditDraft}
                          onEdit={() => startEdit(item)}
                          onSave={() => void saveEdit(item.id)}
                          onCancel={() => setEditingId("")}
                          onVoid={() => void voidItem(item.id)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-8 space-y-3 lg:hidden">
            {items.map((item) => {
              const editing = editingId === item.id;
              const canVoid =
                item.status === "available" && !item.order_id && !editing;
              const canEdit =
                item.status !== "void" && item.status !== "consumed";

              return (
                <article
                  key={item.id}
                  className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/70 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-slate-500">
                        Account #{item.id.slice(0, 8)}…
                      </p>
                      <Link
                        href={`/admin/products/${item.product_id}/edit`}
                        className="mt-1 block break-words text-sm font-medium hover:text-blue-300"
                      >
                        {item.product_title || "Product"}
                      </Link>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs capitalize ${statusClass(item.status)}`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                    <div>
                      <dt>Created</dt>
                      <dd className="mt-0.5 text-slate-300">
                        {new Date(item.created_at).toLocaleDateString("en-MY")}
                      </dd>
                    </div>
                    <div>
                      <dt>Assigned</dt>
                      <dd className="mt-0.5 text-slate-300">
                        {item.assigned_at
                          ? new Date(item.assigned_at).toLocaleDateString("en-MY")
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Delivered</dt>
                      <dd className="mt-0.5 text-slate-300">
                        {item.delivered_at
                          ? new Date(item.delivered_at).toLocaleDateString("en-MY")
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Order</dt>
                      <dd className="mt-0.5 font-mono text-slate-300">
                        {item.order_id ? `${item.order_id.slice(0, 8)}…` : "—"}
                      </dd>
                    </div>
                  </dl>
                  {editing && (
                    <div className="mt-3 space-y-2">
                      <input
                        value={editDraft.label}
                        onChange={(e) =>
                          setEditDraft((current) => ({
                            ...current,
                            label: e.target.value,
                          }))
                        }
                        placeholder="Label"
                        className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      />
                      <input
                        value={editDraft.game_uid_hint}
                        onChange={(e) =>
                          setEditDraft((current) => ({
                            ...current,
                            game_uid_hint: e.target.value,
                          }))
                        }
                        placeholder="Game UID hint"
                        className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      />
                      <textarea
                        value={editDraft.notes_internal}
                        onChange={(e) =>
                          setEditDraft((current) => ({
                            ...current,
                            notes_internal: e.target.value,
                          }))
                        }
                        placeholder="Internal notes"
                        rows={2}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                  <div className="mt-3">
                    <InventoryItemActions
                      item={item}
                      editing={editing}
                      canEdit={canEdit}
                      canVoid={canVoid}
                      busyId={busyId}
                      editDraft={editDraft}
                      setEditDraft={setEditDraft}
                      onEdit={() => startEdit(item)}
                      onSave={() => void saveEdit(item.id)}
                      onCancel={() => setEditingId("")}
                      onVoid={() => void voidItem(item.id)}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function InventoryItemActions(props: {
  item: InventoryItemPublic;
  editing: boolean;
  canEdit: boolean;
  canVoid: boolean;
  busyId: string;
  editDraft: { label: string; game_uid_hint: string; notes_internal: string };
  setEditDraft: React.Dispatch<
    React.SetStateAction<{
      label: string;
      game_uid_hint: string;
      notes_internal: string;
    }>
  >;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onVoid: () => void;
}) {
  const {
    item,
    editing,
    canEdit,
    canVoid,
    busyId,
    onEdit,
    onSave,
    onCancel,
    onVoid,
  } = props;

  return (
    <div className="flex flex-wrap gap-2">
      {canEdit && !editing && (
        <button
          type="button"
          onClick={onEdit}
          className="min-h-11 rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs hover:border-blue-500"
        >
          Edit
        </button>
      )}
      {editing && (
        <>
          <button
            type="button"
            disabled={busyId === item.id}
            onClick={onSave}
            className="min-h-11 rounded-lg border border-blue-500/40 px-2.5 py-1.5 text-xs text-blue-300 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs"
          >
            Cancel
          </button>
        </>
      )}
      {canVoid && (
        <button
          type="button"
          disabled={busyId === item.id}
          onClick={onVoid}
          className="min-h-11 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs text-red-300 disabled:opacity-50"
        >
          Void
        </button>
      )}
    </div>
  );
}
