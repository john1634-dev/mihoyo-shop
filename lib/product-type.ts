/** Logical product categories for storefront account listings. */
export const PRODUCT_TYPES = [
  "ENDGAME_ACCOUNT",
  "REROLL_ACCOUNT",
  "TOP_UP",
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];

export const DEFAULT_PRODUCT_TYPE: ProductType = "ENDGAME_ACCOUNT";

/** Admin may create Endgame, Reroll, and WhatsApp-only Top Up listings. */
export const ADMIN_CREATABLE_PRODUCT_TYPES = [
  "ENDGAME_ACCOUNT",
  "REROLL_ACCOUNT",
  "TOP_UP",
] as const;

export type AdminCreatableProductType =
  (typeof ADMIN_CREATABLE_PRODUCT_TYPES)[number];

export function normalizeProductType(value: unknown): ProductType {
  if (value === "REROLL_ACCOUNT") return "REROLL_ACCOUNT";
  if (value === "TOP_UP") return "TOP_UP";
  return DEFAULT_PRODUCT_TYPE;
}

export function isAdminCreatableProductType(
  value: string
): value is AdminCreatableProductType {
  return (ADMIN_CREATABLE_PRODUCT_TYPES as readonly string[]).includes(value);
}

export function getProductTypeLabel(type: ProductType): string {
  switch (type) {
    case "REROLL_ACCOUNT":
      return "Reroll Account";
    case "TOP_UP":
      return "Top Up";
    default:
      return "Endgame Account";
  }
}

/** PDP heading — Top Up uses the fuller "Game Top Up" phrase. */
export function getPdpProductTypeLabel(type: ProductType): string {
  if (type === "TOP_UP") return "Game Top Up";
  return getProductTypeLabel(type);
}

/** Purchase-state copy for cards/PDP — does not change inventory math. */
export function storefrontPurchaseStateLabel(input: {
  productType: ProductType;
  stockLabel: string;
  listed: boolean;
}): string {
  if (isWhatsAppOnlyProductType(input.productType)) {
    return input.listed ? "WhatsApp Only" : "Unavailable";
  }
  return input.stockLabel;
}

export function isAccountProductType(type: ProductType): boolean {
  return type === "ENDGAME_ACCOUNT" || type === "REROLL_ACCOUNT";
}

/** Top Up is fulfilled via WhatsApp enquiry — never Stripe or Shopee. */
export function isWhatsAppOnlyProductType(type: ProductType): boolean {
  return type === "TOP_UP";
}

export function isStripeCheckoutAllowed(type: ProductType): boolean {
  return isAccountProductType(type);
}

/**
 * Parse a public /products?type= query. Unknown values are ignored
 * (not coerced to ENDGAME_ACCOUNT).
 */
export function parseStorefrontProductTypeFilter(
  value: unknown
): ProductType | "" {
  if (
    value === "ENDGAME_ACCOUNT" ||
    value === "REROLL_ACCOUNT" ||
    value === "TOP_UP"
  ) {
    return value;
  }
  return "";
}

export function storefrontProductTypeHref(type: ProductType): string {
  return `/products?type=${encodeURIComponent(type)}`;
}

/** Existing `games.slug` query value — trim only, no second slug system. */
export function parseStorefrontGameSlug(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

/** Shareable catalog URL using existing `type` + `game` slug query params. */
export function storefrontCatalogHref(input: {
  type?: ProductType | "";
  game?: string | null;
}): string {
  const params = new URLSearchParams();
  const type = parseStorefrontProductTypeFilter(input.type);
  const game = parseStorefrontGameSlug(input.game);
  if (type) params.set("type", type);
  if (game) params.set("game", game);
  const query = params.toString();
  return query ? `/products?${query}` : "/products";
}

export function catalogTypeTitle(type: ProductType | string): string {
  const resolved = parseStorefrontProductTypeFilter(type);
  if (resolved === "TOP_UP") return "Game Top Up";
  if (resolved === "ENDGAME_ACCOUNT") return "Endgame Accounts";
  if (resolved === "REROLL_ACCOUNT") return "Reroll Accounts";
  return "Game Accounts";
}

export function catalogTypeLandingPrompt(type: ProductType): string {
  switch (type) {
    case "REROLL_ACCOUNT":
      return "Choose a game to find a fresh-start account.";
    case "TOP_UP":
      return "Choose your game and contact us on WhatsApp to top up.";
    default:
      return "Choose a game to find the account you're looking for.";
  }
}

export function catalogNoGamesForTypeMessage(type: ProductType): string {
  if (type === "TOP_UP") return "No top up listings are available yet.";
  return `No ${catalogTypeTitle(type)} are available yet.`;
}

export function catalogNoListingsForGameMessage(
  type: ProductType,
  gameName: string
): string {
  return `No ${catalogTypeTitle(type)} are currently available for ${gameName}.`;
}

export const CATALOG_TYPE_NAV: Array<{
  type: ProductType;
  label: string;
}> = [
  { type: "ENDGAME_ACCOUNT", label: "Endgame Accounts" },
  { type: "REROLL_ACCOUNT", label: "Reroll Accounts" },
  { type: "TOP_UP", label: "Top Up" },
];
