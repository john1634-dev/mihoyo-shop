import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ZINKGAME_SYNC_SUPPLIER } from "@/lib/supplier/sync-lock";

export type SyncRunTriggerType = "cron" | "manual";
export type SyncRunStatus =
  | "running"
  | "completed"
  | "failed"
  | "source_unavailable";

export type SupplierSyncRunRow = {
  id: string;
  supplier: string;
  trigger_type: SyncRunTriggerType;
  status: SyncRunStatus;
  started_at: string;
  finished_at: string | null;
  checked: number;
  price_updated: number;
  status_updated: number;
  requires_review: number;
  errors: number;
  unchanged: number;
  skipped: number;
  new_products: number;
  new_products_imported?: number;
  new_products_skipped?: number;
  images_imported?: number;
  translation_failures?: number;
  game_mapping_failures?: number;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
};

export type SyncRunCounters = {
  checked?: number;
  priceUpdated?: number;
  statusUpdated?: number;
  requiresReview?: number;
  errors?: number;
  unchanged?: number;
  skipped?: number;
  newProducts?: number;
  newProductsImported?: number;
  newProductsSkipped?: number;
  imagesImported?: number;
  translationFailures?: number;
  gameMappingFailures?: number;
  durationMs?: number | null;
  errorMessage?: string | null;
};

export async function createSupplierSyncRun(
  client: SupabaseClient,
  input: {
    supplier?: string;
    triggerType: SyncRunTriggerType;
    startedAt?: string;
  }
): Promise<SupplierSyncRunRow> {
  const startedAt = input.startedAt ?? new Date().toISOString();
  const { data, error } = await client
    .from("supplier_sync_runs")
    .insert({
      supplier: input.supplier ?? ZINKGAME_SYNC_SUPPLIER,
      trigger_type: input.triggerType,
      status: "running",
      started_at: startedAt,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as SupplierSyncRunRow;
}

export async function finishSupplierSyncRun(
  client: SupabaseClient,
  runId: string,
  status: Exclude<SyncRunStatus, "running">,
  counters: SyncRunCounters = {}
): Promise<void> {
  const finishedAt = new Date().toISOString();
  const { error } = await client
    .from("supplier_sync_runs")
    .update({
      status,
      finished_at: finishedAt,
      checked: counters.checked ?? 0,
      price_updated: counters.priceUpdated ?? 0,
      status_updated: counters.statusUpdated ?? 0,
      requires_review: counters.requiresReview ?? 0,
      errors: counters.errors ?? 0,
      unchanged: counters.unchanged ?? 0,
      skipped: counters.skipped ?? 0,
      new_products: counters.newProducts ?? 0,
      new_products_imported: counters.newProductsImported ?? 0,
      new_products_skipped: counters.newProductsSkipped ?? 0,
      images_imported: counters.imagesImported ?? 0,
      translation_failures: counters.translationFailures ?? 0,
      game_mapping_failures: counters.gameMappingFailures ?? 0,
      duration_ms: counters.durationMs ?? null,
      error_message: counters.errorMessage ?? null,
    })
    .eq("id", runId);

  if (error) throw error;
}

export async function listSupplierSyncRuns(
  client: SupabaseClient,
  options: { supplier?: string; limit?: number } = {}
): Promise<SupplierSyncRunRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const { data, error } = await client
    .from("supplier_sync_runs")
    .select("*")
    .eq("supplier", options.supplier ?? ZINKGAME_SYNC_SUPPLIER)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as SupplierSyncRunRow[];
}
