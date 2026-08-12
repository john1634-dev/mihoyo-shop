"use client";

import Image from "next/image";
import { useMemo } from "react";
import { getGameImageUrl, GAME_IMAGE_QUALITY } from "@/lib/games";
import type { Game, Product } from "@/lib/types";

type HeroVisualProps = {
  games: Game[];
  products: Product[];
};

export default function HeroVisual({ games, products }: HeroVisualProps) {
  const tiles = useMemo(() => {
    const items: { src: string; alt: string }[] = [];

    for (const game of games) {
      const src = getGameImageUrl(game);
      if (src) items.push({ src, alt: game.name });
      if (items.length >= 4) return items;
    }

    for (const product of products) {
      if (product.cover_image_url) {
        items.push({ src: product.cover_image_url, alt: product.title });
      }
      if (items.length >= 4) break;
    }

    return items;
  }, [games, products]);

  if (tiles.length === 0) return null;

  return (
    <div className="hero-visual" aria-hidden>
      {tiles.map((tile, index) => (
        <div
          key={`${tile.src}-${index}`}
          className={`hero-visual-tile hero-visual-tile-${index + 1}`}
        >
          <Image
            src={tile.src}
            alt=""
            fill
            sizes="(max-width: 1024px) 40vw, 280px"
            quality={GAME_IMAGE_QUALITY}
            className="object-cover"
            priority={index === 0}
          />
        </div>
      ))}
    </div>
  );
}
