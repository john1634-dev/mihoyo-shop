import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const SUPPLIER_SYNC_LOCK_TTL_MS = 15 * 60 * 1000;
export const ZINKGAME_SYNC_SUPPLIER = "zinkgame";

export type SyncLock = {
  acquired: boolean;
  token: string | null;
  alreadyRunning: boolean;
};

export function isLockExpired(
  expiresAt: string | Date | null | undefined,
  now = new Date()
): boolean {
  if (!expiresAt) return true;
  const expires = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const ts = expires.getTime();
  if (!Number.isFinite(ts)) return true;
  return ts <= now.getTime();
}

export async function acquireSupplierSyncLock(
  client: SupabaseClient,
  supplier = ZINKGAME_SYNC_SUPPLIER,
  ttlMs = SUPPLIER_SYNC_LOCK_TTL_MS
): Promise<SyncLock> {
  const token = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  const nowIso = now.toISOString();

  const { data: taken, error: takeoverError } = await client
    .from("supplier_sync_locks")
    .update({
      locked_at: nowIso,
      expires_at: expiresAt,
      lock_token: token,
    })
    .eq("supplier", supplier)
    .lt("expires_at", nowIso)
    .select("id")
    .maybeSingle();

  if (takeoverError) throw takeoverError;
  if (taken) {
    return { acquired: true, token, alreadyRunning: false };
  }

  const { error: insertError } = await client.from("supplier_sync_locks").insert({
    supplier,
    lock_token: token,
    locked_at: nowIso,
    expires_at: expiresAt,
  });

  if (!insertError) {
    return { acquired: true, token, alreadyRunning: false };
  }

  if (insertError.code === "23505") {
    return { acquired: false, token: null, alreadyRunning: true };
  }

  throw insertError;
}

export async function releaseSupplierSyncLock(
  client: SupabaseClient,
  token: string,
  supplier = ZINKGAME_SYNC_SUPPLIER
): Promise<void> {
  if (!token) return;
  const { error } = await client
    .from("supplier_sync_locks")
    .delete()
    .eq("supplier", supplier)
    .eq("lock_token", token);

  if (error) throw error;
}
