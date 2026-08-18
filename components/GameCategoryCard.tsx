import Link from "next/link";
import GameImage from "@/components/GameImage";
import { ArrowRightIcon } from "@/components/icons";
import { getGameImageUrl } from "@/lib/games";
import type { Game } from "@/lib/types";

type GameCategoryCardProps = {
  game: Game;
  accountCount: number;
  href?: string;
  cta?: string;
  countLabel?: string;
  compact?: boolean;
  variant?: "media" | "tile";
  selected?: boolean;
};

export default function GameCategoryCard({
  game,
  accountCount,
  href,
  cta = "Browse accounts",
  countLabel,
  compact = false,
  variant = "media",
  selected = false,
}: GameCategoryCardProps) {
  const hasStock = accountCount > 0;
  const listingLabel =
    countLabel ||
    (accountCount === 0
      ? "Sold Out"
      : accountCount === 1
        ? "1 Account Available"
        : `${accountCount} Accounts Available`);
  const targetHref = href || `/products?game=${game.slug}`;

  if (variant === "tile") {
    const thumb = getGameImageUrl(game);
    return (
      <Link
        href={targetHref}
        className={`game-card flex h-full min-h-[5.75rem] items-center gap-3 rounded-xl bg-[var(--surface-card)] p-3 ${
          selected ? "ring-2 ring-[var(--accent-strong)]" : ""
        }`}
      >
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-muted)] sm:h-14 sm:w-14">
          {thumb ? (
            <GameImage
              game={game}
              variant="card"
              sizes="56px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-bold text-[var(--accent-strong)]">
              {game.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[var(--foreground)] sm:text-[15px]">
            {game.name}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{listingLabel}</p>
          <span className="mt-1 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-[var(--accent-strong)]">
            {cta}
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </span>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={targetHref}
      className={`game-card group relative block overflow-hidden ${compact ? "rounded-xl" : "rounded-2xl"} ${
        selected ? "ring-2 ring-[var(--accent-strong)]" : ""
      }`}
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
              <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-400/25">
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
