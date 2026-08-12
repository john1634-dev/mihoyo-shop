import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  const base = SITE_URL.replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/account",
          "/account/",
          "/login",
          "/register",
          "/forgot-password",
          "/reset-password",
          "/api/",
          "/cart",
          "/checkout",
          "/orders/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
