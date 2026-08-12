"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ImageUploader from "@/components/ImageUploader";
import { createSlug } from "@/lib/validation";

type Game = {
  id: string;
  name: string;
};

type UploadedImage = {
  url: string;
  path: string;
};

export default function NewProductPage() {
  const router = useRouter();

  const [games, setGames] = useState<Game[]>([]);
  const [images, setImages] = useState<UploadedImage[]>([]);

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
  const [shopeeUrl, setShopeeUrl] = useState("");
  const [status, setStatus] = useState("available");

  const [loadingGames, setLoadingGames] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function loadGames() {
      setLoadingGames(true);

      const { data, error } = await supabase
        .from("games")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order");

      if (error) {
        setError(error.message);
      } else {
        setGames(data || []);
      }

      setLoadingGames(false);
    }

    loadGames();
  }, []);

  function createSlugFromTitle(value: string) {
    return createSlug(value);
  }

  function handleTitleChange(value: string) {
    setTitle(value);

    if (!slug) {
      setSlug(createSlugFromTitle(value));
    }
  }

  async function createProduct(event: FormEvent) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    if (!title.trim()) {
      setError("Please enter a product name.");
      setSaving(false);
      return;
    }

    const finalSlug = createSlug(slug || title);

    if (!finalSlug) {
      setError("Please enter a valid slug.");
      setSaving(false);
      return;
    }

    if (!price || Number(price) < 0) {
      setError("Please enter a valid price.");
      setSaving(false);
      return;
    }

    const coverImage =
      images.length > 0
        ? images[0].url
        : null;

    const productResult = await supabase
      .from("products")
      .insert({
        title: title.trim(),
        slug: finalSlug,
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
        shopee_url: shopeeUrl.trim() || null,
        status,
        cover_image_url: coverImage,
      })
      .select("id")
      .single();

    if (productResult.error) {
      setError(productResult.error.message);
      setSaving(false);
      return;
    }

    const productId = productResult.data.id;

    if (images.length > 0) {
      const imageRows = images.map(
        (image, index) => ({
          product_id: productId,
          image_url: image.url,
          image_path: image.path,
          sort_order: index,
        })
      );

      const imageResult = await supabase
        .from("product_images")
        .insert(imageRows);

      if (imageResult.error) {
        setError(
          "Product created, but images failed to save: " +
            imageResult.error.message
        );

        setSaving(false);
        return;
      }
    }

    setSuccess(
      "Product created successfully!"
    );

    setTimeout(() => {
      router.push("/admin/products");
      router.refresh();
    }, 800);
  }

  if (loadingGames) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        Loading...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-5xl">

        <Link
          href="/admin/products"
          className="text-sm text-slate-400 hover:text-white"
        >
          ← Back to Products
        </Link>

        <h1 className="mt-5 text-3xl font-bold">
          Add Product
        </h1>

        <p className="mt-2 text-slate-400">
          Create a new game account listing.
        </p>

        <form
          onSubmit={createProduct}
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
                    handleTitleChange(
                      event.target.value
                    )
                  }
                  placeholder="Example: Genshin Impact AR60"
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
                  placeholder="genshin-impact-ar60"
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
                  min="0"
                  value={price}
                  onChange={(event) =>
                    setPrice(event.target.value)
                  }
                  placeholder="299.00"
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
                  placeholder="Asia / America / Europe"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />

              </div>

              <div>

                <label className="mb-2 block text-sm text-slate-300">
                  AR / Level
                </label>

                <input
                  type="number"
                  min="0"
                  value={arLevel}
                  onChange={(event) =>
                    setArLevel(event.target.value)
                  }
                  placeholder="60"
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
                    setDescription(
                      event.target.value
                    )
                  }
                  rows={8}
                  placeholder="Account details..."
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
                  min="0"
                  value={supplierCost}
                  onChange={(event) =>
                    setSupplierCost(
                      event.target.value
                    )
                  }
                  placeholder="200.00"
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
                    setSupplierName(
                      event.target.value
                    )
                  }
                  placeholder="Supplier name"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />

              </div>

            </div>

            <div className="mt-5">
              <label className="mb-2 block text-sm text-slate-300">
                Shopee Product URL (optional)
              </label>
              <input
                type="url"
                value={shopeeUrl}
                onChange={(event) => setShopeeUrl(event.target.value)}
                placeholder="https://shopee.com.my/..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
              />
              <p className="mt-2 text-xs text-slate-500">
                Leave empty to use the global Gameslot Shopee store link.
              </p>
            </div>

          </section>


          {/* Images */}

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

            <h2 className="text-xl font-semibold">
              Product Images
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              The first image will automatically become the cover image.
            </p>

            <div className="mt-6">

              <ImageUploader
                onImagesChange={(uploadedImages) => {
                  setImages(uploadedImages);
                }}
              />

            </div>

          </section>


          {/* Messages */}

          {error && (
            <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-400">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-xl border border-green-900 bg-green-950/40 p-4 text-sm text-green-400">
              {success}
            </div>
          )}


          {/* Buttons */}

          <div className="flex justify-end gap-4">

            <Link
              href="/admin/products"
              className="rounded-xl border border-slate-700 px-6 py-3 hover:bg-slate-900"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-600 px-8 py-3 font-semibold hover:bg-blue-500 disabled:opacity-50"
            >
              {saving
                ? "Creating..."
                : "Create Product"}
            </button>

          </div>

        </form>

      </div>
    </main>
  );
}