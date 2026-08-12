import type { Game } from "@/lib/types";

const GAME_ASSETS_BUCKET = "game-assets";
const PUBLIC_STORAGE_MARKER = `/storage/v1/object/public/${GAME_ASSETS_BUCKET}/`;

type GameImageFields = Pick<
  Game,
  "image_url" | "banner_url" | "mobile_banner_url" | "logo_url"
>;

/** Display-size hints for next/image — browser multiplies by DPR for srcset. */
export const GAME_IMAGE_SIZES = {
  /** Homepage / products game cards — 1 col mobile, 2 col tablet, 4 col desktop */
  card: "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px",
  /** Products page active-game banner — full width on mobile, max 384px desktop */
  header: "(max-width: 640px) calc(100vw - 48px), 384px",
  /** Filter chip avatar — 24px CSS box, allow 2x/3x DPR */
  avatar: "64px",
} as const;

export type GameImageVariant = keyof typeof GAME_IMAGE_SIZES;

/** Category images only — product cards keep next/image default (75). */
export const GAME_IMAGE_QUALITY = 90;

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
