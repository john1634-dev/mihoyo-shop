"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { adminFetch } from "@/lib/admin-api";
import { getGameImageUrl, slugifyGameName } from "@/lib/games";
import type { Game } from "@/lib/types";

type EditableGame = Game & {
  is_active: boolean;
  sort_order: number;
};

const EMPTY_GAME = {
  name: "",
  slug: "",
  description: "",
  is_active: true,
  sort_order: 50,
};

export default function AdminGamesPage() {
  const [games, setGames] = useState<EditableGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [removingImageId, setRemovingImageId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [newGame, setNewGame] = useState({ ...EMPTY_GAME });
  const [slugTouched, setSlugTouched] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError("");

      try {
        const response = await adminFetch("/api/admin/games", {
          cache: "no-store",
        });
        const result = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Your session has expired. Please sign in again.");
          }
          if (response.status === 403) {
            throw new Error("You do not have permission to manage games.");
          }
          throw new Error(result.error || "Failed to load games.");
        }

        if (!cancelled) {
          setGames((result.games ?? []) as EditableGame[]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load games.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function refreshGames() {
    setReloadKey((value) => value + 1);
  }

  const sortedGames = useMemo(
    () =>
      [...games].sort((a, b) => {
        if (a.sort_order !== b.sort_order) {
          return a.sort_order - b.sort_order;
        }
        return a.name.localeCompare(b.name);
      }),
    [games]
  );

  function updateGame(
    id: string,
    field: keyof EditableGame,
    value: string | boolean | number
  ) {
    setGames((current) =>
      current.map((game) =>
        game.id === id ? { ...game, [field]: value } : game
      )
    );
  }

  async function saveGame(game: EditableGame) {
    try {
      setSavingId(game.id);
      setError("");
      setSuccess("");

      const response = await adminFetch("/api/admin/games", {
        method: "PATCH",
        headers: {
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
          item.id === game.id ? (data.game as EditableGame) : item
        )
      );
      setSuccess(`${game.name} saved successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save game.");
    } finally {
      setSavingId(null);
    }
  }

  async function uploadImage(
    gameId: string,
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingId(gameId);
      setError("");
      setSuccess("");

      const formData = new FormData();
      formData.append("game_id", gameId);
      formData.append("file", file);

      const response = await adminFetch("/api/admin/games/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      setGames((current) =>
        current.map((game) =>
          game.id === gameId ? (data.game as EditableGame) : game
        )
      );
      setSuccess("Category image uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed.");
    } finally {
      setUploadingId(null);
      event.target.value = "";
    }
  }

  async function removeImage(game: EditableGame) {
    if (!game.image_url) return;

    const confirmed = window.confirm(
      `Remove the category image for ${game.name}?`
    );
    if (!confirmed) return;

    try {
      setRemovingImageId(game.id);
      setError("");
      setSuccess("");

      const response = await adminFetch("/api/admin/games/upload", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ game_id: game.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to remove image.");
      }

      setGames((current) =>
        current.map((item) =>
          item.id === game.id ? (data.game as EditableGame) : item
        )
      );
      setSuccess("Category image removed.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove image."
      );
    } finally {
      setRemovingImageId(null);
    }
  }

  async function deleteGame(game: EditableGame) {
    const confirmed = window.confirm(
      `Delete ${game.name}? This cannot be undone. Games with linked products must be disabled instead.`
    );
    if (!confirmed) return;

    try {
      setDeletingId(game.id);
      setError("");
      setSuccess("");

      const response = await adminFetch(`/api/admin/games?id=${game.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete game.");
      }

      setGames((current) => current.filter((item) => item.id !== game.id));
      setSuccess(`${game.name} deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete game.");
    } finally {
      setDeletingId(null);
    }
  }

  async function createGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setCreating(true);
      setError("");
      setSuccess("");

      if (!newGame.name.trim() || !newGame.slug.trim()) {
        setError("Game name and slug are required.");
        return;
      }

      const response = await adminFetch("/api/admin/games", {
        method: "POST",
        headers: {
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

      setGames((current) => [...current, data.game as EditableGame]);
      setNewGame({ ...EMPTY_GAME });
      setSlugTouched(false);
      setSuccess("Game created successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create game.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-slate-500">
              <Link href="/admin" className="hover:text-slate-300">
                Admin
              </Link>{" "}
              / Games
            </p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Games</h1>
            <p className="mt-2 text-sm text-slate-400">
              Manage game categories, artwork, visibility, and sort order.
            </p>
          </div>

          <button
            type="button"
            onClick={refreshGames}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm hover:bg-slate-900"
          >
            Refresh
          </button>
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

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 text-lg font-semibold">Add Game</h2>

          <form
            onSubmit={createGame}
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-6"
          >
            <input
              value={newGame.name}
              onChange={(event) => {
                const name = event.target.value;
                setNewGame((current) => ({
                  ...current,
                  name,
                  slug: slugTouched ? current.slug : slugifyGameName(name),
                }));
              }}
              placeholder="Game name"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />

            <input
              value={newGame.slug}
              onChange={(event) => {
                setSlugTouched(true);
                setNewGame({ ...newGame, slug: event.target.value });
              }}
              placeholder="game-slug"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />

            <input
              value={newGame.description}
              onChange={(event) =>
                setNewGame({ ...newGame, description: event.target.value })
              }
              placeholder="Description"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-blue-500 md:col-span-2"
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
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />

            <button
              type="submit"
              disabled={creating}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:opacity-50"
            >
              {creating ? "Adding..." : "Add Game"}
            </button>
          </form>
        </section>

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
            Loading games...
          </div>
        ) : sortedGames.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center">
            <h2 className="text-lg font-semibold">No games yet</h2>
            <p className="mt-2 text-sm text-slate-400">
              Create your first game category above.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedGames.map((game) => {
              const previewUrl = getGameImageUrl(game);
              const isSaving = savingId === game.id;
              const isUploading = uploadingId === game.id;
              const isRemovingImage = removingImageId === game.id;
              const isDeleting = deletingId === game.id;

              return (
                <section
                  key={game.id}
                  className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"
                >
                  <div className="flex flex-col gap-4 border-b border-slate-800 p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                        {previewUrl ? (
                          <Image
                            src={previewUrl}
                            alt={game.name}
                            fill
                            sizes="96px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-slate-600">
                            No image
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl font-semibold">{game.name}</h2>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              game.is_active
                                ? "bg-emerald-500/10 text-emerald-300"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {game.is_active ? "Active" : "Disabled"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{game.slug}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void saveGame(game)}
                        disabled={isSaving}
                        className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void deleteGame(game)}
                        disabled={isDeleting}
                        className="rounded-xl border border-red-500/40 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                      >
                        {isDeleting ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block md:col-span-2">
                        <span className="mb-2 block text-sm text-slate-400">
                          Game Name
                        </span>
                        <input
                          value={game.name}
                          onChange={(event) =>
                            updateGame(game.id, "name", event.target.value)
                          }
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm text-slate-400">
                          Slug
                        </span>
                        <input
                          value={game.slug}
                          onChange={(event) =>
                            updateGame(game.id, "slug", event.target.value)
                          }
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
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
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        />
                      </label>

                      <label className="block md:col-span-2">
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
                          className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        />
                      </label>

                      <label className="flex items-center gap-2 text-sm text-slate-300 md:col-span-2">
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
                        Active category
                      </label>
                    </div>

                    <div>
                      <p className="mb-2 text-sm font-medium text-slate-300">
                        Category Image
                      </p>

                      <div className="relative mb-3 aspect-[16/10] overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                        {previewUrl ? (
                          <Image
                            src={previewUrl}
                            alt={`${game.name} category`}
                            fill
                            sizes="280px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-slate-600">
                            No image uploaded
                          </div>
                        )}
                      </div>

                      <div className="grid gap-2">
                        <label className="block cursor-pointer rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-center text-sm text-slate-300 transition hover:border-blue-500">
                          {isUploading ? "Uploading..." : "Upload Image"}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={isUploading}
                            onChange={(event) => void uploadImage(game.id, event)}
                            className="hidden"
                          />
                        </label>

                        {game.image_url && (
                          <button
                            type="button"
                            onClick={() => void removeImage(game)}
                            disabled={isRemovingImage}
                            className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-red-500 hover:text-red-300 disabled:opacity-50"
                          >
                            {isRemovingImage ? "Removing..." : "Remove Image"}
                          </button>
                        )}
                      </div>

                      <p className="mt-2 text-[11px] text-slate-600">
                        JPG / PNG / WebP · max 8 MB
                      </p>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
    </div>
  );
}
