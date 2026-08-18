import Link from "next/link";
import GameImage from "@/components/GameImage";
import { ArrowRightIcon } from "@/components/icons";
import type { Game } from "@/lib/types";

type GameCategoryCardProps = {
  game: Game;
  accountCount: number;
  href?: string;
  cta?: string;
  countLabel?: string;
  compact?: boolean;
};

export default function GameCategoryCard({
  game,
  accountCount,
  href,
  cta = "Browse accounts",
  countLabel,
  compact = false,
}: GameCategoryCardProps) {
  const hasStock = accountCount > 0;
  const listingLabel =
    countLabel ||
    (accountCount === 0
      ? "Sold Out"
      : accountCount === 1
        ? "1 Account Available"
        : `${accountCount} Accounts Available`);

  return (
    <Link
      href={href || `/products?game=${game.slug}`}
      className={`game-card group relative block overflow-hidden ${compact ? "rounded-xl" : "rounded-2xl"}`}
    >
      <div
        className={`relative overflow-hidden ${compact ? "aspect-[16/10]" : "aspect-[4/3]"}`}
      >
        <GameImage
          game={game}
          variant="card"
          className="object-cover transition duration-200 ease-out group-hover:scale-[1.03] motion-reduce:transform-none"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-slate-900/75 via-slate-900/25 to-transparent"
          aria-hidden
        />

        <div className={`absolute inset-x-0 bottom-0 ${compact ? "p-3" : "p-4"}`}>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3
                className={`truncate font-semibold tracking-tight text-white ${compact ? "text-sm sm:text-base" : "text-base sm:text-lg"}`}
              >
                {game.name}
              </h3>
              <p className="mt-1 text-xs text-slate-200 sm:text-sm">
                {listingLabel}
              </p>
            </div>
            {hasStock && (
              <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200">
                Live
              </span>
            )}
          </div>

          <span
            className={`inline-flex items-center gap-1 font-semibold text-blue-100 transition duration-200 group-hover:text-white ${compact ? "mt-2 min-h-9 text-xs sm:text-sm" : "mt-3 min-h-10 text-sm"}`}
          >
            {cta}
            <ArrowRightIcon className="h-4 w-4 transition duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none" />
          </span>
        </div>
      </div>
    </Link>
  );
}
