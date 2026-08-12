import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";

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

  const [{ data: games }, { data: products }] = await Promise.all([
    supabase.from("games").select("slug").eq("is_active", true),
    supabase
      .from("products")
      .select("slug, created_at")
      .eq("status", "available"),
  ]);

  const gameRoutes: MetadataRoute.Sitemap = (games || []).map((game) => ({
    url: `${base}/products?game=${encodeURIComponent(game.slug)}`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const productRoutes: MetadataRoute.Sitemap = (products || []).map(
    (product) => ({
      url: `${base}/product/${product.slug}`,
      lastModified: new Date(product.created_at || Date.now()),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })
  );

  return [...staticRoutes, ...gameRoutes, ...productRoutes];
}
