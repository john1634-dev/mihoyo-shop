"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { formatPrice } from "@/lib/config";

type Product = {
  id: string;
  title: string;
  price: number;
  currency: string;
  status: string;
  server: string | null;
  ar_level: number | null;
  cover_image_url: string | null;
  cost_myr: number | null;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    let active = true;

    async function loadProducts() {
      setLoading(true);
      setError("");

      const result = await supabase
        .from("products")
        .select("id,title,price,currency,status,server,ar_level,cover_image_url,cost_myr")
        .order("created_at", { ascending: false });

      if (!active) {
        return;
      }

      if (result.error) {
        setError(result.error.message);
      } else {
        setProducts(result.data || []);
      }

      setLoading(false);
    }

    loadProducts();

    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesStatus =
        statusFilter === "all" || product.status === statusFilter;

      if (!matchesStatus) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        product.title.toLowerCase().includes(query) ||
        (product.server || "").toLowerCase().includes(query) ||
        product.status.toLowerCase().includes(query)
      );
    });
  }, [products, search, statusFilter]);

  async function updateStatus(productId: string, newStatus: string) {
    const result = await supabase
      .from("products")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId);

    if (result.error) {
      alert(result.error.message);
      return;
    }

    setProducts((current) =>
      current.map((product) =>
        product.id === productId
          ? { ...product, status: newStatus }
          : product
      )
    );
  }

  async function deleteProduct(product: Product) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this product?"
    );

    if (!confirmed) {
      return;
    }

    const result = await supabase
      .from("products")
      .delete()
      .eq("id", product.id);

    if (result.error) {
      alert(result.error.message);
      return;
    }

    setProducts((current) =>
      current.filter((item) => item.id !== product.id)
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-3xl font-bold">Products</h1>
          <p className="mt-6 text-slate-400">Loading products...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/admin"
              className="text-sm text-slate-400 hover:text-white"
            >
              Back to Dashboard
            </Link>
            <h1 className="mt-3 text-3xl font-bold">Products</h1>
            <p className="mt-2 text-slate-400">Manage your game accounts.</p>
          </div>

          <Link
            href="/admin/products/new"
            className="rounded-xl bg-blue-600 px-5 py-3 text-center font-medium hover:bg-blue-500"
          >
            Add Product
          </Link>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products by title, server, or status..."
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 outline-none focus:border-blue-500"
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
          >
            <option value="all">All statuses</option>
            <option value="available">Available</option>
            <option value="sold">Sold</option>
            <option value="hidden">Hidden</option>
          </select>
        </div>

        {error && (
          <div className="mt-8 rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-400">
            {error}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center">
            <h2 className="text-xl font-semibold">
              {products.length === 0 ? "No products yet" : "No matching products"}
            </h2>
            <p className="mt-2 text-slate-400">
              {products.length === 0
                ? "Create your first product."
                : "Try a different search."}
            </p>
            {products.length === 0 && (
              <Link
                href="/admin/products/new"
                className="mt-6 inline-block rounded-xl bg-blue-600 px-5 py-3 font-medium hover:bg-blue-500"
              >
                Add Product
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-10 overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full min-w-[1000px]">
              <thead className="bg-slate-900">
                <tr className="border-b border-slate-800 text-left text-sm text-slate-400">
                  <th className="px-5 py-4">Product</th>
                  <th className="px-5 py-4">Server</th>
                  <th className="px-5 py-4">AR</th>
                  <th className="px-5 py-4">Price</th>
                  <th className="px-5 py-4">Cost</th>
                  <th className="px-5 py-4">Profit</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Action</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((product) => (
                  <tr
                    key={product.id}
                    className="border-b border-slate-800 hover:bg-slate-900"
                  >
                    <td className="px-5 py-5">
                      <div className="flex items-center gap-3">
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-800">
                          {product.cover_image_url ? (
                            <Image
                              src={product.cover_image_url}
                              alt={product.title}
                              fill
                              sizes="48px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-slate-500">
                              —
                            </div>
                          )}
                        </div>
                        <span className="font-medium">{product.title}</span>
                      </div>
                    </td>

                    <td className="px-5 py-5 text-slate-400">
                      {product.server || "-"}
                    </td>

                    <td className="px-5 py-5 text-slate-400">
                      {product.ar_level ?? "-"}
                    </td>

                    <td className="px-5 py-5 font-semibold">
                      {formatPrice(Number(product.price), product.currency)}
                    </td>

                    <td className="px-5 py-5 text-slate-300">
                      {product.cost_myr !== null
                        ? formatPrice(Number(product.cost_myr), "MYR")
                        : "-"}
                    </td>

                    <td className="px-5 py-5 text-slate-300">
                      {product.cost_myr !== null
                        ? formatPrice(
                            Number(product.price) - Number(product.cost_myr),
                            "MYR"
                          )
                        : "-"}
                    </td>

                    <td className="px-5 py-5">
                      <span
                        className={
                          product.status === "available"
                            ? "rounded-full bg-green-500/10 px-3 py-1 text-xs text-green-400"
                            : product.status === "sold"
                              ? "rounded-full bg-red-500/10 px-3 py-1 text-xs text-red-400"
                              : "rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400"
                        }
                      >
                        {product.status}
                      </span>
                    </td>

                    <td className="px-5 py-5">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/admin/products/${product.id}/edit`}
                          className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-blue-500 hover:text-blue-400"
                        >
                          Edit
                        </Link>

                        {product.status === "available" ? (
                          <button
                            type="button"
                            onClick={() => updateStatus(product.id, "sold")}
                            className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-yellow-500 hover:text-yellow-400"
                          >
                            Sold
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              updateStatus(product.id, "available")
                            }
                            className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-green-500 hover:text-green-400"
                          >
                            Available
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => deleteProduct(product)}
                          className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-red-500 hover:text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
