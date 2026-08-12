import type { Game } from "@/lib/types";

const GAME_ASSETS_BUCKET = "game-assets";
const PUBLIC_STORAGE_MARKER = `/storage/v1/object/public/${GAME_ASSETS_BUCKET}/`;

type GameImageFields = Pick<
  Game,
  "image_url" | "banner_url" | "mobile_banner_url" | "logo_url"
>;

/** Primary category image with legacy fallbacks for older rows. */
export function getGameImageUrl(game: GameImageFields): string | null {
  return (
    game.image_url ||
    game.banner_url ||
    game.mobile_banner_url ||
    game.logo_url ||
    null
  );
}

/** Extract storage object path from a public game-assets URL, if owned by our bucket. */
export function extractGameAssetStoragePath(
  publicUrl: string | null | undefined
): string | null {
  if (!publicUrl) return null;

  const idx = publicUrl.indexOf(PUBLIC_STORAGE_MARKER);
  if (idx === -1) return null;

  const path = publicUrl.slice(idx + PUBLIC_STORAGE_MARKER.length);
  return path || null;
}

export function slugifyGameName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
