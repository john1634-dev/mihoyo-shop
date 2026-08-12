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
      className="game-card group relative block overflow-hidden rounded-xl border border-white/[0.08] bg-slate-900/60 sm:rounded-2xl"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <GameImage
          game={game}
          variant="card"
          className="object-cover transition duration-200 ease-out group-hover:scale-[1.02] motion-reduce:transform-none"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/50 to-slate-950/10"
          aria-hidden
        />

        <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold tracking-tight text-white sm:text-lg">
                {game.name}
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-300 sm:text-xs">
                {accountCount} account{accountCount === 1 ? "" : "s"} available
              </p>
            </div>
            {hasStock && (
              <span className="shrink-0 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400 ring-1 ring-emerald-500/25">
                Live
              </span>
            )}
          </div>

          <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-400 transition duration-200 group-hover:text-blue-300 sm:text-sm">
            View accounts
            <ArrowRightIcon className="h-3.5 w-3.5 transition duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none" />
          </span>
        </div>
      </div>
    </Link>
  );
}
