"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ImageUploader from "@/components/ImageUploader";

type Game = {
  id: string;
  name: string;
};

type ProductImage = {
  id: string;
  image_url: string;
  image_path: string;
  sort_order: number;
};

type NewImage = {
  url: string;
  path: string;
};

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();

  const productId = params.id as string;

  const [games, setGames] = useState<Game[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [newImages, setNewImages] = useState<NewImage[]>([]);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [gameId, setGameId] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("MYR");
  const [server, setServer] = useState("");
  const [arLevel, setArLevel] = useState("");
  const [description, setDescription] = useState("");
  const [supplierCost, setSupplierCost] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [status, setStatus] = useState("available");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError("");

      const productResult = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .single();

      const gamesResult = await supabase
        .from("games")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order");

      const imagesResult = await supabase
        .from("product_images")
        .select("*")
        .eq("product_id", productId)
        .order("sort_order");

      if (productResult.error) {
        setError(productResult.error.message);
        setLoading(false);
        return;
      }

      if (gamesResult.error) {
        setError(gamesResult.error.message);
        setLoading(false);
        return;
      }

      if (imagesResult.error) {
        setError(imagesResult.error.message);
        setLoading(false);
        return;
      }

      const product = productResult.data;

      setGames(gamesResult.data || []);
      setImages(imagesResult.data || []);

      setTitle(product.title || "");
      setSlug(product.slug || "");
      setGameId(product.game_id || "");

      setPrice(
        product.price !== null
          ? String(product.price)
          : ""
      );

      setCurrency(product.currency || "MYR");
      setServer(product.server || "");

      setArLevel(
        product.ar_level !== null
          ? String(product.ar_level)
          : ""
      );

      setDescription(product.description || "");

      setSupplierCost(
        product.supplier_cost !== null
          ? String(product.supplier_cost)
          : ""
      );

      setSupplierName(product.supplier_name || "");
      setStatus(product.status || "available");

      setLoading(false);
    }

    loadData();
  }, [productId]);

  async function saveChanges(event: FormEvent) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    const productUpdate = await supabase
      .from("products")
      .update({
        title: title.trim(),
        slug: slug.trim(),
        game_id: gameId || null,
        price: Number(price),
        currency,
        server: server || null,
        ar_level: arLevel
          ? Number(arLevel)
          : null,
        description: description || null,
        supplier_cost: supplierCost
          ? Number(supplierCost)
          : null,
        supplier_name: supplierName || null,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId);

    if (productUpdate.error) {
      setError(productUpdate.error.message);
      setSaving(false);
      return;
    }

    /*
     * Save newly uploaded images
     */
    if (newImages.length > 0) {
      const startingOrder = images.length;

      const rows = newImages.map((image, index) => ({
        product_id: productId,
        image_url: image.url,
        image_path: image.path,
        sort_order: startingOrder + index,
      }));

      const insertResult = await supabase
        .from("product_images")
        .insert(rows);

      if (insertResult.error) {
        setError(
          "Product saved, but images failed to save: " +
            insertResult.error.message
        );

        setSaving(false);
        return;
      }
    }

    /*
     * Update cover image
     */
    const allImageUrls = [
      ...images.map((image) => image.image_url),
      ...newImages.map((image) => image.url),
    ];

    const coverImage =
      allImageUrls.length > 0
        ? allImageUrls[0]
        : null;

    const coverResult = await supabase
      .from("products")
      .update({
        cover_image_url: coverImage,
      })
      .eq("id", productId);

    if (coverResult.error) {
      setError(
        "Product saved, but cover image failed to update: " +
          coverResult.error.message
      );

      setSaving(false);
      return;
    }

    setSuccess("Product updated successfully.");

    setTimeout(() => {
      router.push("/admin/products");
      router.refresh();
    }, 800);

    setSaving(false);
  }

  async function moveImage(imageId: string, direction: "left" | "right") {
    const index = images.findIndex((image) => image.id === imageId);

    if (index < 0) {
      return;
    }

    const targetIndex = direction === "left" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= images.length) {
      return;
    }

    const reordered = [...images];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    const withOrder = reordered.map((image, order) => ({
      ...image,
      sort_order: order,
    }));

    setImages(withOrder);

    const updates = withOrder.map((image) =>
      supabase
        .from("product_images")
        .update({ sort_order: image.sort_order })
        .eq("id", image.id)
    );

    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);

    if (failed?.error) {
      setError(failed.error.message);
      return;
    }

    const coverResult = await supabase
      .from("products")
      .update({
        cover_image_url: withOrder[0]?.image_url || null,
      })
      .eq("id", productId);

    if (coverResult.error) {
      setError(coverResult.error.message);
    }
  }

  async function deleteImage(image: ProductImage) {
    const confirmed = window.confirm(
      "Delete this image?"
    );

    if (!confirmed) {
      return;
    }

    setError("");

    /*
     * Delete from Supabase Storage
     */
    const storageResult = await supabase.storage
      .from("product-images")
      .remove([image.image_path]);

    if (storageResult.error) {
      setError(storageResult.error.message);
      return;
    }

    /*
     * Delete database record
     */
    const databaseResult = await supabase
      .from("product_images")
      .delete()
      .eq("id", image.id);

    if (databaseResult.error) {
      setError(databaseResult.error.message);
      return;
    }

    /*
     * Update local image list
     */
    const updatedImages = images
      .filter((item) => item.id !== image.id)
      .map((item, index) => ({
        ...item,
        sort_order: index,
      }));

    setImages(updatedImages);

    /*
     * Update cover image
     */
    const newCover =
      updatedImages.length > 0
        ? updatedImages[0].image_url
        : null;

    const coverResult = await supabase
      .from("products")
      .update({
        cover_image_url: newCover,
      })
      .eq("id", productId);

    if (coverResult.error) {
      setError(coverResult.error.message);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <div className="mx-auto max-w-5xl">
          Loading product...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white md:p-10">
      <div className="mx-auto max-w-5xl">

        <Link
          href="/admin/products"
          className="text-sm text-slate-400 hover:text-white"
        >
          ← Back to Products
        </Link>

        <h1 className="mt-5 text-3xl font-bold">
          Edit Product
        </h1>

        <form
          onSubmit={saveChanges}
          className="mt-8 space-y-8"
        >

          {/* Basic Information */}

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

            <h2 className="text-xl font-semibold">
              Basic Information
            </h2>

            <div className="mt-6 grid gap-5 md:grid-cols-2">

              <div className="md:col-span-2">

                <label className="mb-2 block text-sm text-slate-300">
                  Game
                </label>

                <select
                  value={gameId}
                  onChange={(event) =>
                    setGameId(event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                >
                  <option value="">
                    Select a game
                  </option>

                  {games.map((game) => (
                    <option
                      key={game.id}
                      value={game.id}
                    >
                      {game.name}
                    </option>
                  ))}
                </select>

              </div>

              <div>

                <label className="mb-2 block text-sm text-slate-300">
                  Product Name
                </label>

                <input
                  value={title}
                  onChange={(event) =>
                    setTitle(event.target.value)
                  }
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />

              </div>

              <div>

                <label className="mb-2 block text-sm text-slate-300">
                  Slug
                </label>

                <input
                  value={slug}
                  onChange={(event) =>
                    setSlug(event.target.value)
                  }
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />

              </div>

              <div>

                <label className="mb-2 block text-sm text-slate-300">
                  Price
                </label>

                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(event) =>
                    setPrice(event.target.value)
                  }
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />

              </div>

              <div>

                <label className="mb-2 block text-sm text-slate-300">
                  Currency
                </label>

                <select
                  value={currency}
                  onChange={(event) =>
                    setCurrency(event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                >
                  <option value="MYR">
                    MYR
                  </option>
                </select>

              </div>

              <div>

                <label className="mb-2 block text-sm text-slate-300">
                  Server
                </label>

                <input
                  value={server}
                  onChange={(event) =>
                    setServer(event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />

              </div>

              <div>

                <label className="mb-2 block text-sm text-slate-300">
                  AR / Level
                </label>

                <input
                  type="number"
                  value={arLevel}
                  onChange={(event) =>
                    setArLevel(event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />

              </div>

              <div className="md:col-span-2">

                <label className="mb-2 block text-sm text-slate-300">
                  Description
                </label>

                <textarea
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
                  }
                  rows={8}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />

              </div>

            </div>

          </section>

          {/* Status */}

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

            <h2 className="text-xl font-semibold">
              Product Status
            </h2>

            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value)
              }
              className="mt-5 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
            >
              <option value="available">
                Available
              </option>

              <option value="sold">
                Sold
              </option>

              <option value="hidden">
                Hidden
              </option>
            </select>

          </section>

          {/* Supplier */}

          <section className="rounded-2xl border border-amber-900/40 bg-slate-900 p-6">

            <h2 className="text-xl font-semibold">
              Internal Supplier Information
            </h2>

            <p className="mt-1 text-sm text-amber-400">
              Customers cannot see this information.
            </p>

            <div className="mt-6 grid gap-5 md:grid-cols-2">

              <div>

                <label className="mb-2 block text-sm text-slate-300">
                  Supplier Cost
                </label>

                <input
                  type="number"
                  step="0.01"
                  value={supplierCost}
                  onChange={(event) =>
                    setSupplierCost(event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />

              </div>

              <div>

                <label className="mb-2 block text-sm text-slate-300">
                  Supplier Name
                </label>

                <input
                  value={supplierName}
                  onChange={(event) =>
                    setSupplierName(event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />

              </div>

            </div>

          </section>

          {/* Product Images */}

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

            <h2 className="text-xl font-semibold">
              Product Images
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              The first image is the cover image.
            </p>

            {/* Existing Images */}

            {images.length > 0 && (
              <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">

                {images.map((image, index) => (
                  <div
                    key={image.id}
                    className="relative overflow-hidden rounded-xl border border-slate-800"
                  >

                    {/* eslint-disable-next-line @next/next/no-img-element */}
<img
  src={image.image_url}
                      alt={
                        "Product image " +
                        (index + 1)
                      }
                      className="aspect-square w-full object-cover"
                    />

                    {index === 0 && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-3 py-2 text-xs">
                        Cover Image
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => deleteImage(image)}
                      className="absolute right-2 top-2 rounded-lg bg-black/70 px-3 py-1 text-xs hover:bg-red-600"
                    >
                      Delete
                    </button>

                    <div className="absolute left-2 top-2 flex gap-1">
                      <button
                        type="button"
                        onClick={() => moveImage(image.id, "left")}
                        disabled={index === 0}
                        className="rounded-lg bg-black/70 px-2 py-1 text-xs disabled:opacity-30"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={() => moveImage(image.id, "right")}
                        disabled={index === images.length - 1}
                        className="rounded-lg bg-black/70 px-2 py-1 text-xs disabled:opacity-30"
                      >
                        →
                      </button>
                    </div>

                  </div>
                ))}

              </div>
            )}

            {/* New Images */}

            {newImages.length > 0 && (
              <div className="mt-8">

                <h3 className="mb-3 font-medium">
                  New Images
                </h3>

                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">

                  {newImages.map((image, index) => (
                    <div
                      key={image.path}
                      className="relative overflow-hidden rounded-xl border border-blue-900"
                    >

                      {/* eslint-disable-next-line @next/next/no-img-element */}
<img
  src={image.url}
                        alt={
                          "New image " +
                          (index + 1)
                        }
                        className="aspect-square w-full object-cover"
                      />

                      <div className="absolute bottom-0 left-0 right-0 bg-blue-950/80 px-3 py-2 text-xs">
                        Will be saved
                      </div>

                    </div>
                  ))}

                </div>

              </div>
            )}

            {/* Upload */}

            <div className="mt-8 border-t border-slate-800 pt-8">

              <h3 className="font-medium">
                Add More Images
              </h3>

              <p className="mt-2 text-sm text-slate-400">
                Paste screenshots with Ctrl + V or upload image files.
              </p>

              <div className="mt-4">

                <ImageUploader
                  onImagesChange={(uploadedImages) => {
                    setNewImages(uploadedImages);
                  }}
                />

              </div>

            </div>

          </section>

          {/* Error */}

          {error && (
            <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Success */}

          {success && (
            <div className="rounded-xl border border-green-900 bg-green-950/40 p-4 text-sm text-green-400">
              {success}
            </div>
          )}

          {/* Buttons */}

          <div className="flex justify-end gap-4">

            <Link
              href="/admin/products"
              className="rounded-xl border border-slate-700 px-6 py-3"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-600 px-8 py-3 font-semibold hover:bg-blue-500 disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : "Save Changes"}
            </button>

          </div>

        </form>

      </div>
    </main>
  );
}