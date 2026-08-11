"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Game = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  mobile_banner_url: string | null;
  is_active: boolean;
  sort_order: number;
};

type ImageType = "logo" | "banner" | "mobile_banner";

type UploadingState = {
  gameId: string;
  type: ImageType;
} | null;

export default function AdminGamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState<UploadingState>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [newGame, setNewGame] = useState({
    name: "",
    slug: "",
    description: "",
    is_active: true,
    sort_order: 50,
  });

  async function getAuthHeaders() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("You are not logged in.");
    }

    return {
      Authorization: `Bearer ${session.access_token}`,
    };
  }


  useEffect(() => {
    let cancelled = false;
  
    async function loadInitialGames() {
      setLoading(true);
      setError("");
  
      try {
        const response = await fetch("/api/admin/games", {
          cache: "no-store",
        });
  
        const result = await response.json();
  
        if (!response.ok) {
          throw new Error(result.error || "Failed to load games.");
        }
  
        if (!cancelled) {
          setGames(result.games ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          setError(
            error instanceof Error
              ? error.message
              : "Failed to load games."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
  
    loadInitialGames();
  
    return () => {
      cancelled = true;
    };
  }, []);

  function updateGame(
    id: string,
    field: keyof Game,
    value: string | boolean | number
  ) {
    setGames((current) =>
      current.map((game) =>
        game.id === id ? { ...game, [field]: value } : game
      )
    );
  }

  async function saveGame(game: Game) {
    try {
      setSaving(game.id);
      setError("");
      setSuccess("");

      const headers = await getAuthHeaders();

      const response = await fetch("/api/admin/games", {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: game.id,
          name: game.name,
          slug: game.slug,
          description: game.description,
          is_active: game.is_active,
          sort_order: Number(game.sort_order),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save game.");
      }

      setGames((current) =>
        current.map((item) =>
          item.id === game.id ? data.game : item
        )
      );

      setSuccess(`${game.name} saved successfully.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save game."
      );
    } finally {
      setSaving(null);
    }
  }

  async function uploadImage(
    gameId: string,
    type: ImageType,
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      setUploading({ gameId, type });
      setError("");
      setSuccess("");

      const headers = await getAuthHeaders();

      const formData = new FormData();
      formData.append("game_id", gameId);
      formData.append("type", type);
      formData.append("file", file);

      const response = await fetch("/api/admin/games/upload", {
        method: "POST",
        headers,
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      setGames((current) =>
        current.map((game) =>
          game.id === gameId ? data.game : game
        )
      );

      setSuccess("Image uploaded successfully.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Image upload failed."
      );
    } finally {
      setUploading(null);
      event.target.value = "";
    }
  }

  async function createGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setError("");
      setSuccess("");

      if (!newGame.name.trim() || !newGame.slug.trim()) {
        setError("Game name and slug are required.");
        return;
      }

      const headers = await getAuthHeaders();

      const response = await fetch("/api/admin/games", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...newGame,
          sort_order: Number(newGame.sort_order),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create game.");
      }

      setGames((current) =>
        [...current, data.game].sort(
          (a, b) => a.sort_order - b.sort_order
        )
      );

      setNewGame({
        name: "",
        slug: "",
        description: "",
        is_active: true,
        sort_order: 50,
      });

      setSuccess("Game created successfully.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create game."
      );
    }
  }

  function imageLabel(type: ImageType) {
    if (type === "logo") return "Logo";
    if (type === "banner") return "Desktop Banner";
    return "Mobile Banner";
  }

  function imageUrl(game: Game, type: ImageType) {
    if (type === "logo") return game.logo_url;
    if (type === "banner") return game.banner_url;
    return game.mobile_banner_url;
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold sm:text-3xl">
            Games
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Manage games, logos and desktop/mobile banners.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            {success}
          </div>
        )}

        <section className="mb-8 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 text-lg font-semibold">
            Add Game
          </h2>

          <form
            onSubmit={createGame}
            className="grid gap-4 md:grid-cols-2 lg:grid-cols-5"
          >
            <input
              value={newGame.name}
              onChange={(event) =>
                setNewGame({
                  ...newGame,
                  name: event.target.value,
                })
              }
              placeholder="Game name"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />

            <input
              value={newGame.slug}
              onChange={(event) =>
                setNewGame({
                  ...newGame,
                  slug: event.target.value,
                })
              }
              placeholder="game-slug"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />

            <input
              value={newGame.description}
              onChange={(event) =>
                setNewGame({
                  ...newGame,
                  description: event.target.value,
                })
              }
              placeholder="Description"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />

            <input
              type="number"
              value={newGame.sort_order}
              onChange={(event) =>
                setNewGame({
                  ...newGame,
                  sort_order: Number(event.target.value),
                })
              }
              placeholder="Sort order"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />

            <button
              type="submit"
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
            >
              Add Game
            </button>
          </form>
        </section>

        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
            Loading games...
          </div>
        ) : (
          <div className="space-y-6">
            {games.map((game) => (
              <section
                key={game.id}
                className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"
              >
                <div className="flex flex-col gap-4 border-b border-slate-800 p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">
                      {game.name}
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      {game.slug}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={game.is_active}
                        onChange={(event) =>
                          updateGame(
                            game.id,
                            "is_active",
                            event.target.checked
                          )
                        }
                        className="h-4 w-4"
                      />
                      Active
                    </label>

                    <button
                      onClick={() => saveGame(game)}
                      disabled={saving === game.id}
                      className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
                    >
                      {saving === game.id ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>

                <div className="grid gap-6 p-5 lg:grid-cols-2">
                  <div className="space-y-4">
                    <label className="block">
                      <span className="mb-2 block text-sm text-slate-400">
                        Game Name
                      </span>

                      <input
                        value={game.name}
                        onChange={(event) =>
                          updateGame(
                            game.id,
                            "name",
                            event.target.value
                          )
                        }
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm text-slate-400">
                        Slug
                      </span>

                      <input
                        value={game.slug}
                        onChange={(event) =>
                          updateGame(
                            game.id,
                            "slug",
                            event.target.value
                          )
                        }
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm text-slate-400">
                        Description
                      </span>

                      <textarea
                        value={game.description || ""}
                        onChange={(event) =>
                          updateGame(
                            game.id,
                            "description",
                            event.target.value
                          )
                        }
                        rows={4}
                        className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm text-slate-400">
                        Sort Order
                      </span>

                      <input
                        type="number"
                        value={game.sort_order}
                        onChange={(event) =>
                          updateGame(
                            game.id,
                            "sort_order",
                            Number(event.target.value)
                          )
                        }
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-3">
                    {(
                      [
                        "logo",
                        "banner",
                        "mobile_banner",
                      ] as ImageType[]
                    ).map((type) => {
                      const url = imageUrl(game, type);
                      const isUploading =
                        uploading?.gameId === game.id &&
                        uploading?.type === type;

                      return (
                        <div key={type}>
                          <p className="mb-2 text-sm font-medium text-slate-300">
                            {imageLabel(type)}
                          </p>

                          <div className="mb-3 flex h-32 items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                            {url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={url}
                                alt={`${game.name} ${imageLabel(type)}`}
                                className={
                                  type === "logo"
                                    ? "max-h-24 max-w-[80%] object-contain"
                                    : "h-full w-full object-cover"
                                }
                              />
                            ) : (
                              <span className="text-xs text-slate-600">
                                No image
                              </span>
                            )}
                          </div>

                          <label className="block cursor-pointer rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-center text-xs text-slate-300 transition hover:border-slate-500">
                            {isUploading
                              ? "Uploading..."
                              : `Upload ${imageLabel(type)}`}

                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              disabled={isUploading}
                              onChange={(event) =>
                                uploadImage(
                                  game.id,
                                  type,
                                  event
                                )
                              }
                              className="hidden"
                            />
                          </label>

                          <p className="mt-2 text-[11px] text-slate-600">
                            JPG / PNG / WebP
                            <br />
                            {type === "logo"
                              ? "Max 2MB"
                              : "Max 5MB"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}