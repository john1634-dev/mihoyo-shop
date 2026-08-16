import Link from "next/link";
import GameImage from "@/components/GameImage";
import { ArrowRightIcon } from "@/components/icons";
import type { Game } from "@/lib/types";

type GameCategoryCardProps = {
  game: Game;
  accountCount: number;
};

export default function GameCategoryCard({
  game,
  accountCount,
}: GameCategoryCardProps) {
  const hasStock = accountCount > 0;

  return (
    <Link
      href={`/products?game=${game.slug}`}
      className="game-card group relative block overflow-hidden rounded-2xl"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <GameImage
          game={game}
          variant="card"
          className="object-cover transition duration-200 ease-out group-hover:scale-[1.03] motion-reduce:transform-none"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-slate-900/75 via-slate-900/25 to-transparent"
          aria-hidden
        />

        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-semibold tracking-tight text-white sm:text-lg">
                {game.name}
              </h3>
              <p className="mt-1 text-xs text-slate-200 sm:text-sm">
                {accountCount} account{accountCount === 1 ? "" : "s"}
              </p>
            </div>
            {hasStock && (
              <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200">
                Live
              </span>
            )}
          </div>

          <span className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-blue-100 transition duration-200 group-hover:text-white">
            Browse accounts
            <ArrowRightIcon className="h-4 w-4 transition duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none" />
          </span>
        </div>
      </div>
    </Link>
  );
}
