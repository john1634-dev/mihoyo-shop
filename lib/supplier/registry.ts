import type { SupplierAdapter } from "@/lib/supplier/adapter";
import { zinkgameAdapter } from "@/lib/supplier/zinkgame";

const ADAPTERS: Record<string, SupplierAdapter> = {
  zinkgame: zinkgameAdapter,
};

export function getSupplierAdapter(source: string): SupplierAdapter | null {
  const key = source.trim().toLowerCase();
  return ADAPTERS[key] ?? null;
}

export function listSupplierSources(): string[] {
  return Object.keys(ADAPTERS);
}
