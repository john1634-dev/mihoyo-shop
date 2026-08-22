import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteAdminProduct } from "@/lib/admin-product-delete";
import { logServerError } from "@/lib/errors";
import {
  resolveProductAccountCode,
  type CatalogFetchAssessment,
} from "@/lib/supplier/account-code";

export type { CatalogFetchAssessment } from "@/lib/supplier/account-code";

export type AutoDeleteAction = "deleted" | "hidden" | "skipped" | "error";

export type AutoDeleteDetail = {
  productId: string;
  accountCode: string | null;
  action: AutoDeleteAction;
  reason: string | null;
};

export type AutoDeleteResult = {
  ran: boolean;
  skippedReason: string | null;
  catalogAccountCodes: number;
  checked: number;
  deleted: number;
  hidden: number;
  skipped: number;
  errors: number;
  details: AutoDeleteDetail[];
};

type AutoImportedRow = {
  id: string;
  title: string;
  source_account_code: string | null;
  source_import_mode: string | null;
};

function isMissingLifecycleColumnError(message?: string): boolean {
  if (!message) return false;
  return (
    /source_account_code|source_import_mode/i.test(message) &&
    /column|schema|exist/i.test(message)
  );
}

async function loadAutoImportedProducts(
  client: SupabaseClient
): Promise<AutoImportedRow[] | null> {
  const primary = await client
    .from("products")
    .select("id,title,source_account_code,source_import_mode")
    .eq("source", "zinkgame")
    .eq("source_import_mode", "auto");

  if (!primary.error) {
    return (primary.data ?? []) as AutoImportedRow[];
  }

  if (isMissingLifecycleColumnError(primary.error.message)) {
    return null;
  }

  throw primary.error;
}

/**
 * Remove auto-imported ZinkGame listings whose account code is absent from a
 * complete, successfully parsed supplier catalog.
 */
export async function reconcileMissingAutoImportedProducts(
  client: SupabaseClient,
  input: {
    confirm: boolean;
    catalogAssessment: CatalogFetchAssessment;
  }
): Promise<AutoDeleteResult> {
  const empty: AutoDeleteResult = {
    ran: false,
    skippedReason: null,
    catalogAccountCodes: input.catalogAssessment.accountCodes.size,
    checked: 0,
    deleted: 0,
    hidden: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  if (input.confirm !== true) {
    return { ...empty, skippedReason: "not_confirmed" };
  }

  if (!input.catalogAssessment.complete) {
    return {
      ...empty,
      skippedReason:
        input.catalogAssessment.reason ?? "incomplete_supplier_catalog",
    };
  }

  let rows: AutoImportedRow[] | null;
  try {
    rows = await loadAutoImportedProducts(client);
  } catch (error) {
    logServerError("auto-delete load products", error);
    return {
      ...empty,
      ran: false,
      skippedReason: "load_failed",
      errors: 1,
    };
  }

  if (rows === null) {
    return {
      ...empty,
      skippedReason: "lifecycle_columns_missing",
    };
  }

  const result: AutoDeleteResult = {
    ran: true,
    skippedReason: null,
    catalogAccountCodes: input.catalogAssessment.accountCodes.size,
    checked: rows.length,
    deleted: 0,
    hidden: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  for (const row of rows) {
    const accountCode = resolveProductAccountCode({
      sourceAccountCode: row.source_account_code,
      title: row.title,
    });

    if (!accountCode) {
      result.skipped += 1;
      result.details.push({
        productId: row.id,
        accountCode: null,
        action: "skipped",
        reason: "missing_account_code",
      });
      continue;
    }

    if (input.catalogAssessment.accountCodes.has(accountCode)) {
      result.skipped += 1;
      result.details.push({
        productId: row.id,
        accountCode,
        action: "skipped",
        reason: "still_in_supplier_catalog",
      });
      continue;
    }

    try {
      const outcome = await deleteAdminProduct(client, {
        productId: row.id,
        confirm: true,
      });

      if (outcome.deleted) {
        result.deleted += 1;
        result.details.push({
          productId: row.id,
          accountCode,
          action: "deleted",
          reason: null,
        });
        continue;
      }

      if (outcome.hidden) {
        result.hidden += 1;
        result.details.push({
          productId: row.id,
          accountCode,
          action: "hidden",
          reason: outcome.message,
        });
        continue;
      }

      result.errors += 1;
      result.details.push({
        productId: row.id,
        accountCode,
        action: "error",
        reason: outcome.message,
      });
    } catch (error) {
      logServerError("auto-delete product", error);
      result.errors += 1;
      result.details.push({
        productId: row.id,
        accountCode,
        action: "error",
        reason:
          error instanceof Error ? error.message : "Auto-delete failed.",
      });
    }
  }

  return result;
}
