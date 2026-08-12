import Image from "next/image";
import {
  GAME_IMAGE_QUALITY,
  GAME_IMAGE_SIZES,
  getGameImageUrl,
  type GameImageVariant,
} from "@/lib/games";
import type { Game } from "@/lib/types";

type GameImageProps = {
  game: Pick<Game, "name" | "image_url" | "banner_url" | "mobile_banner_url" | "logo_url">;
  className?: string;
  /** Preset tuned to the rendered slot — preferred over manual sizes. */
  variant?: GameImageVariant;
  sizes?: string;
  priority?: boolean;
  quality?: number;
};

export default function GameImage({
  game,
  className = "object-cover",
  variant = "card",
  sizes,
  priority = false,
  quality = GAME_IMAGE_QUALITY,
}: GameImageProps) {
  const src = getGameImageUrl(game);
  const resolvedSizes = sizes ?? GAME_IMAGE_SIZES[variant];

  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
        <div className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-lg font-bold text-blue-400">
            {game.name.charAt(0).toUpperCase()}
          </div>
          <p className="px-3 text-xs text-slate-500">{game.name}</p>
        </div>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={game.name}
      fill
      sizes={resolvedSizes}
      quality={quality}
      className={className}
      priority={priority}
      loading={priority ? undefined : "lazy"}
    />
  );
}
