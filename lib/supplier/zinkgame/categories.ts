import {
  getZinkGameBaseUrl,
  isAllowedZinkGameUrl,
} from "@/lib/supplier/config";

export const ZINKGAME_ALLOWED_CATEGORY_SLUGS = [
  "genshin-impact",
  "wuthering-waves",
] as const;

export type ZinkGameAllowedCategorySlug =
  (typeof ZINKGAME_ALLOWED_CATEGORY_SLUGS)[number];

export type ZinkGameAllowedCategory = {
  slug: ZinkGameAllowedCategorySlug;
  path: `/category/account/${ZinkGameAllowedCategorySlug}`;
  label: string;
  gameNames: readonly string[];
};

export const ZINKGAME_ALLOWED_CATEGORIES: readonly ZinkGameAllowedCategory[] = [
  {
    slug: "genshin-impact",
    path: "/category/account/genshin-impact",
    label: "Genshin Impact",
    gameNames: ["Genshin Impact"],
  },
  {
    slug: "wuthering-waves",
    path: "/category/account/wuthering-waves",
    label: "Wuthering Waves",
    gameNames: ["Wuthering Waves"],
  },
] as const;

const SLUG_SET = new Set<string>(ZINKGAME_ALLOWED_CATEGORY_SLUGS);

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isAllowedCategorySlug(
  value: string | null | undefined
): value is ZinkGameAllowedCategorySlug {
  return typeof value === "string" && SLUG_SET.has(value.trim().toLowerCase());
}

export function getAllowedCategoryBySlug(
  slug: string
): ZinkGameAllowedCategory | null {
  const normalized = slug.trim().toLowerCase();
  return (
    ZINKGAME_ALLOWED_CATEGORIES.find((category) => category.slug === normalized) ??
    null
  );
}

/**
 * Resolve an allowlisted category from a slug or exact category URL.
 * Rejects homepage, package categories, other games, and off-host URLs.
 */
export function resolveAllowedCategorySlug(
  input: string | null | undefined
): ZinkGameAllowedCategorySlug | null {
  if (!input?.trim()) return null;
  const trimmed = input.trim();

  if (isAllowedCategorySlug(trimmed)) return trimmed;

  let parsed: URL;
  try {
    parsed = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? new URL(trimmed)
      : new URL(
          trimmed.startsWith("/") ? trimmed : `/${trimmed}`,
          getZinkGameBaseUrl()
        );
  } catch {
    return null;
  }

  if (!isAllowedZinkGameUrl(parsed.toString())) return null;

  const pathname = parsed.pathname.replace(/\/+$/, "").toLowerCase();
  const match = pathname.match(/^\/category\/account\/([a-z0-9-]+)$/);
  if (!match) return null;

  return isAllowedCategorySlug(match[1]) ? match[1] : null;
}

export function getAllowedCategoryUrl(slug: string): string | null {
  const category = getAllowedCategoryBySlug(slug);
  if (!category) return null;

  try {
    const url = new URL(category.path, `${getZinkGameBaseUrl()}/`);
    if (!isAllowedZinkGameUrl(url.toString())) return null;
    if (url.hostname.toLowerCase() !== "zinkgame.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function getAllowedCategoryGameNames(slug: string): readonly string[] {
  return getAllowedCategoryBySlug(slug)?.gameNames ?? [];
}

/** True when a live product category label matches an allowlisted slug. */
export function categoryLabelMatchesSlug(
  categoryLabel: string | null | undefined,
  slug: string
): boolean {
  if (!categoryLabel?.trim()) return false;
  const names = getAllowedCategoryGameNames(slug);
  const key = normalizeKey(categoryLabel);
  return names.some((name) => normalizeKey(name) === key);
}

export function allowedCategorySlugs(): ZinkGameAllowedCategorySlug[] {
  return [...ZINKGAME_ALLOWED_CATEGORY_SLUGS];
}
