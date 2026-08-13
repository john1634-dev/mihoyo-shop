import type { SupabaseClient } from "@supabase/supabase-js";
import { createSlug } from "@/lib/validation";

/** Generate a unique products.slug without overwriting existing listings. */
export async function resolveUniqueProductSlug(
  client: SupabaseClient,
  title: string
): Promise<string> {
  const base = createSlug(title);
  if (!base) {
    throw new Error("Unable to generate slug from title.");
  }

  let candidate = base;
  let suffix = 2;

  while (suffix <= 100) {
    const { data, error } = await client
      .from("products")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (error) throw error;
    if (!data) return candidate;

    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  throw new Error("Unable to generate unique slug.");
}
