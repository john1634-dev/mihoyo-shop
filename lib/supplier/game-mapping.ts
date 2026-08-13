import type { SupabaseClient } from "@supabase/supabase-js";

/** Known ZinkGame category labels → candidate BaituGames game names. */
const ZINKGAME_CATEGORY_TO_GAME_NAMES: Record<string, string[]> = {
  "genshin impact": ["Genshin Impact"],
  "honkai star rail": ["Honkai: Star Rail", "Honkai Star Rail"],
  "honkai: star rail": ["Honkai: Star Rail", "Honkai Star Rail"],
  "wuthering waves": ["Wuthering Waves"],
  "zenless zone zero": ["Zenless Zone Zero"],
  "where winds meet": ["Where Winds Meet"],
  "arknights endfield": ["Arknights: Endfield", "Arknights Endfield"],
  "tower of fantasy global": ["Tower of Fantasy"],
  "call of dragons": ["Call of Dragons"],
};

export type GameRow = {
  id: string;
  name: string;
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Resolve supplier category metadata to an existing games.id — never creates games. */
export function resolveGameIdFromSupplierCategory(
  category: string | null | undefined,
  games: GameRow[]
): string | null {
  if (!category?.trim()) return null;

  const key = normalizeKey(category);
  const candidates = ZINKGAME_CATEGORY_TO_GAME_NAMES[key] ?? [category.trim()];
  const gameByNormalizedName = new Map(
    games.map((game) => [normalizeKey(game.name), game.id])
  );

  for (const candidate of candidates) {
    const id = gameByNormalizedName.get(normalizeKey(candidate));
    if (id) return id;
  }

  return null;
}

export async function loadActiveGames(
  client: SupabaseClient
): Promise<GameRow[]> {
  const { data, error } = await client
    .from("games")
    .select("id,name")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as GameRow[];
}

export function extractSupplierCategory(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  const category = metadata?.category;
  return typeof category === "string" && category.trim() ? category.trim() : null;
}
