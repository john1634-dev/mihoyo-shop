/** Shared bulk-delete limits — safe to import from client and server. */
export const ADMIN_BULK_DELETE_MAX = 50;
export const ADMIN_BULK_DELETE_CHUNK_SIZE = 5;
export const ADMIN_BULK_DELETE_CONCURRENCY = 3;

export function chunkIds<T>(ids: T[], chunkSize = ADMIN_BULK_DELETE_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  return chunks;
}

export function formatBulkDeleteProgress(processed: number, total: number): string {
  return `Deleting ${processed} / ${total}…`;
}

export function summarizeBulkDeleteTotals(input: {
  deleted: number;
  hidden: number;
  failed: number;
}): string {
  const parts: string[] = [];
  if (input.deleted > 0) parts.push(`${input.deleted} deleted`);
  if (input.hidden > 0) parts.push(`${input.hidden} hidden`);
  if (input.failed > 0) parts.push(`${input.failed} failed`);
  return parts.length > 0 ? `${parts.join(", ")}.` : "Bulk delete completed.";
}
