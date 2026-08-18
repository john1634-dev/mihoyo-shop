import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import {
  getProductTypeLabel,
  storefrontProductTypeHref,
  type ProductType,
} from "@/lib/product-type";

const CATEGORIES: Array<{
  type: ProductType;
  title: string;
  subtitle: string;
  cta: string;
}> = [
  {
    type: "ENDGAME_ACCOUNT",
    title: "Endgame Accounts",
    subtitle: "Premium high-level game accounts ready to play.",
    cta: "Browse Endgame Accounts",
  },
  {
    type: "REROLL_ACCOUNT",
    title: "Reroll Accounts",
    subtitle: "Fresh-start and reroll accounts for a new beginning.",
    cta: "Browse Reroll Accounts",
  },
  {
    type: "TOP_UP",
    title: "Game Top Up",
    subtitle: "Fast and easy game top up through WhatsApp.",
    cta: "Top Up Now",
  },
];

export default function HomeCategoryCards() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6 md:py-12">
      <div className="mb-6 md:mb-8">
        <h2 className="section-title">Shop by product</h2>
        <p className="section-subtitle">
          Endgame accounts, reroll accounts, and WhatsApp game top up
        </p>
      </div>
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        {CATEGORIES.map((category) => (
          <Link
            key={category.type}
            href={storefrontProductTypeHref(category.type)}
            className="group flex min-h-[11.5rem] flex-col rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)] transition duration-200 hover:border-blue-200 hover:shadow-[var(--shadow-card-hover)] sm:min-h-[13rem] sm:p-6"
          >
            <span className="inline-flex w-fit rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-strong)]">
              {getProductTypeLabel(category.type)}
            </span>
            <h3 className="mt-3 text-xl font-bold tracking-tight text-[var(--foreground)] sm:text-2xl">
              {category.title}
            </h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--muted)]">
              {category.subtitle}
            </p>
            <span className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[var(--accent-strong)]">
              {category.cta}
              <ArrowRightIcon className="h-4 w-4 transition duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
