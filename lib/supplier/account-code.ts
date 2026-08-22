/**
 * Leading supplier account code: one or more letters + digits at the start of the title.
 * Examples: "H4723 acc..." → "H4723", "S1234 acc..." → "S1234"
 *
 * Returns null when the title does not begin with a confident account-code token.
 */
const LEADING_ACCOUNT_CODE = /^([A-Za-z]+\d+)\b/;

export function extractSupplierAccountCode(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;

  const leading = trimmed.match(LEADING_ACCOUNT_CODE);
  if (!leading) return null;

  const code = leading[1].toUpperCase();
  if (!/[A-Z]/.test(code) || !/\d/.test(code)) return null;

  return code;
}

/** Public/admin product title derived from supplier title — account code only. */
export function buildStorefrontTitleFromSupplierTitle(title: string): string | null {
  return extractSupplierAccountCode(title);
}

export function resolveProductAccountCode(input: {
  sourceAccountCode?: string | null;
  title?: string | null;
}): string | null {
  const stored = input.sourceAccountCode?.trim();
  if (stored) return stored.toUpperCase();

  if (input.title?.trim()) {
    return extractSupplierAccountCode(input.title);
  }

  return null;
}

export function collectCatalogAccountCodes(
  titles: Array<string | null | undefined>
): Set<string> {
  const codes = new Set<string>();
  for (const title of titles) {
    const code = extractSupplierAccountCode(title ?? "");
    if (code) codes.add(code);
  }
  return codes;
}

export type CatalogFetchAssessment = {
  complete: boolean;
  reason: string | null;
  accountCodes: Set<string>;
};

export function assessZinkGameCatalogFetch(input: {
  items: Array<{ title?: string | null }>;
  errors: Array<{ message: string }>;
}): CatalogFetchAssessment {
  if (input.errors.length > 0) {
    return {
      complete: false,
      reason: "category_fetch_errors",
      accountCodes: new Set(),
    };
  }

  const accountCodes = collectCatalogAccountCodes(
    input.items.map((item) => item.title)
  );

  if (input.items.length > 0 && accountCodes.size === 0) {
    return {
      complete: false,
      reason: "no_account_codes_parsed",
      accountCodes,
    };
  }

  return {
    complete: true,
    reason: null,
    accountCodes,
  };
}
