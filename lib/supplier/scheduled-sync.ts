import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/errors";
import { runSafeAutoSync, type AutoSyncResult } from "@/lib/supplier/auto-sync";
import { assessZinkGameCatalogFetch } from "@/lib/supplier/account-code";
import {
  reconcileMissingAutoImportedProducts,
  type AutoDeleteResult,
} from "@/lib/supplier/auto-delete";
import {
  runZinkGameCategoryAutoImport,
  type AutoImportResult,
} from "@/lib/supplier/auto-import";
import {
  acquireSupplierSyncLock,
  releaseSupplierSyncLock,
  ZINKGAME_SYNC_SUPPLIER,
} from "@/lib/supplier/sync-lock";
import {
  createSupplierSyncRun,
  finishSupplierSyncRun,
  type SyncRunStatus,
  type SyncRunTriggerType,
} from "@/lib/supplier/sync-run-log";
import { fetchAllowedCategoryListings } from "@/lib/supplier/zinkgame";

export type ScheduledSyncOutcome =
  | {
      kind: "already_running";
      ok: false;
      status: "already_running";
    }
  | {
      kind: "completed";
      ok: true;
      supplier: string;
      status: "completed";
      runId: string;
      checked: number;
      priceUpdated: number;
      statusUpdated: number;
      requiresReview: number;
      errors: number;
      unchanged: number;
      skipped: number;
      newProducts: number;
      newProductsImported?: number;
      newProductsSkipped?: number;
      imagesImported?: number;
      translationFailures?: number;
      gameMappingFailures?: number;
      durationMs: number;
      result: AutoSyncResult;
      autoImport?: AutoImportResult;
      autoDelete?: AutoDeleteResult;
    }
  | {
      kind: "source_unavailable";
      ok: false;
      supplier: string;
      status: "source_unavailable";
      runId: string;
      sourceUnavailable: true;
      durationMs: number;
      result: AutoSyncResult;
    }
  | {
      kind: "failed";
      ok: false;
      supplier: string;
      status: "failed";
      runId: string | null;
      durationMs: number;
      error: string;
    };

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 300);
  }
  return "Sync failed.";
}

function countersFromResults(
  syncResult: AutoSyncResult,
  importResult: AutoImportResult | null,
  durationMs: number
) {
  return {
    checked: syncResult.checked + (importResult?.checked ?? 0),
    priceUpdated: syncResult.priceUpdated,
    statusUpdated: syncResult.statusUpdated,
    requiresReview: syncResult.requiresReview,
    errors: syncResult.errors + (importResult?.errors ?? 0),
    unchanged: syncResult.unchanged,
    skipped: syncResult.skipped + (importResult?.skipped ?? 0),
    newProducts: importResult?.newProducts ?? syncResult.newProducts,
    newProductsImported: importResult?.imported ?? 0,
    newProductsSkipped: importResult?.skipped ?? 0,
    imagesImported: importResult?.imagesImported ?? 0,
    translationFailures: importResult?.translationFailures ?? 0,
    gameMappingFailures: importResult?.gameMappingFailures ?? 0,
    durationMs,
  };
}

function publicCompletedPayload(
  runId: string,
  result: AutoSyncResult,
  durationMs: number,
  importResult?: AutoImportResult,
  autoDelete?: AutoDeleteResult
): Extract<ScheduledSyncOutcome, { kind: "completed" }> {
  return {
    kind: "completed",
    ok: true,
    supplier: ZINKGAME_SYNC_SUPPLIER,
    status: "completed",
    runId,
    checked: result.checked,
    priceUpdated: result.priceUpdated,
    statusUpdated: result.statusUpdated,
    requiresReview: result.requiresReview,
    errors: result.errors,
    unchanged: result.unchanged,
    skipped: result.skipped,
    newProducts: importResult?.newProducts ?? result.newProducts,
    newProductsImported: importResult?.imported,
    newProductsSkipped: importResult?.skipped,
    imagesImported: importResult?.imagesImported,
    translationFailures: importResult?.translationFailures,
    gameMappingFailures: importResult?.gameMappingFailures,
    durationMs,
    result,
    autoImport: importResult,
    autoDelete,
  };
}

/**
 * Confirmed auto-sync with lock + persistent run log.
 * Reuses Phase 11.5 runSafeAutoSync — does not duplicate pricing/status rules.
 */
export async function runScheduledZinkGameSync(
  client: SupabaseClient,
  input: { triggerType: SyncRunTriggerType }
): Promise<ScheduledSyncOutcome> {
  const started = Date.now();
  const lock = await acquireSupplierSyncLock(client);
  if (!lock.acquired || !lock.token) {
    return { kind: "already_running", ok: false, status: "already_running" };
  }

  let runId: string | null = null;

  try {
    const run = await createSupplierSyncRun(client, {
      triggerType: input.triggerType,
    });
    runId = run.id;

    const listings = await fetchAllowedCategoryListings();
    const listingItems = listings.items;
    const catalogAssessment = assessZinkGameCatalogFetch(listings);

    const importResult = await runZinkGameCategoryAutoImport(client, {
      confirm: true,
      listingItems,
    });

    if (importResult.sourceUnavailable) {
      const durationMs = Date.now() - started;
      await finishSupplierSyncRun(client, runId, "source_unavailable", {
        ...countersFromResults(
          {
            dryRun: false,
            checked: 0,
            priceUpdated: 0,
            statusUpdated: 0,
            unchanged: 0,
            requiresReview: 0,
            errors: 0,
            skipped: 0,
            newProducts: 0,
            details: [],
          },
          importResult,
          durationMs
        ),
        errorMessage: "Exchange rate or category source unavailable.",
      });
      return {
        kind: "source_unavailable",
        ok: false,
        supplier: ZINKGAME_SYNC_SUPPLIER,
        status: "source_unavailable",
        runId,
        sourceUnavailable: true,
        durationMs,
        result: {
          dryRun: false,
          sourceUnavailable: true,
          checked: 0,
          priceUpdated: 0,
          statusUpdated: 0,
          unchanged: 0,
          requiresReview: 0,
          errors: importResult.errors,
          skipped: 0,
          newProducts: 0,
          details: [],
        },
      };
    }

    const result = await runSafeAutoSync(client, {
      confirm: true,
      listingItems,
    });
    const durationMs = Date.now() - started;

    let status: Exclude<SyncRunStatus, "running"> = "completed";
    if (result.sourceUnavailable) {
      status = "source_unavailable";
    }

    const listingError =
      result.sourceUnavailable
        ? result.details.find((item) => item.reason)?.reason ??
          "Supplier listing or exchange rate unavailable."
        : null;

    await finishSupplierSyncRun(client, runId, status, {
      ...countersFromResults(result, importResult, durationMs),
      errorMessage: listingError,
    });

    if (result.sourceUnavailable) {
      return {
        kind: "source_unavailable",
        ok: false,
        supplier: ZINKGAME_SYNC_SUPPLIER,
        status: "source_unavailable",
        runId,
        sourceUnavailable: true,
        durationMs,
        result,
      };
    }

    let autoDelete: AutoDeleteResult | undefined;
    if (catalogAssessment.complete) {
      autoDelete = await reconcileMissingAutoImportedProducts(client, {
        confirm: true,
        catalogAssessment,
      });
    } else {
      logServerError("scheduled zinkgame auto-delete skipped", {
        message:
          catalogAssessment.reason ?? "Supplier catalog fetch incomplete.",
      });
    }

    return publicCompletedPayload(
      runId,
      result,
      durationMs,
      importResult,
      autoDelete
    );
  } catch (error) {
    logServerError("scheduled zinkgame sync", error);
    const durationMs = Date.now() - started;
    if (runId) {
      try {
        await finishSupplierSyncRun(client, runId, "failed", {
          durationMs,
          errorMessage: safeErrorMessage(error),
        });
      } catch (finishError) {
        logServerError("scheduled zinkgame sync finish", finishError);
      }
    }

    return {
      kind: "failed",
      ok: false,
      supplier: ZINKGAME_SYNC_SUPPLIER,
      status: "failed",
      runId,
      durationMs,
      error: "Sync failed.",
    };
  } finally {
    try {
      await releaseSupplierSyncLock(client, lock.token);
    } catch (releaseError) {
      logServerError("scheduled zinkgame sync lock release", releaseError);
    }
  }
}
