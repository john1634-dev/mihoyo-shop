import Link from "next/link";
import GameImage from "@/components/GameImage";
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
      className="group relative block overflow-hidden rounded-2xl border border-white/[0.06] bg-slate-900/40 transition duration-200 ease-out hover:border-blue-500/30 hover:shadow-[0_20px_50px_-24px_rgba(59,130,246,0.35)] motion-reduce:transition-none"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <GameImage
          game={game}
          variant="card"
          className="object-cover transition duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transform-none"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/55 to-slate-950/10"
          aria-hidden
        />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold tracking-tight text-white sm:text-xl">
                {game.name}
              </h3>
              <p className="mt-1 text-sm text-slate-300">
                {accountCount} account{accountCount === 1 ? "" : "s"} available
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                hasStock
                  ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30"
                  : "bg-slate-800/80 text-slate-400 ring-1 ring-slate-700/50"
              }`}
            >
              {hasStock ? "In stock" : "Browse"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
