import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isValidProductSlug(slug: string | null | undefined): slug is string {
  if (!slug || typeof slug !== "string") return false;
  const normalized = slug.trim();
  return normalized.length > 0 && SLUG_PATTERN.test(normalized);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL.replace(/\/$/, "");

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${base}/products`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${base}/legal/terms`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${base}/legal/privacy`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${base}/legal/refund`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  const { data: products, error } = await supabase
    .from("products")
    .select("slug, created_at, updated_at")
    .eq("status", "available")
    .order("created_at", { ascending: false });

  if (error) {
    return staticRoutes;
  }

  const productRoutes: MetadataRoute.Sitemap = (products || [])
    .filter((product) => isValidProductSlug(product.slug))
    .map((product) => ({
      url: `${base}/product/${product.slug}`,
      lastModified: new Date(product.updated_at || product.created_at || Date.now()),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  return [...staticRoutes, ...productRoutes];
}
