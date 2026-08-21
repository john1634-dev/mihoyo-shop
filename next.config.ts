import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { 
    key: "X-Frame-Options", 
    value: "SAMEORIGIN" 
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async redirects() {
    return [
      { source: "/cart", destination: "/products", permanent: false },
      { source: "/orders", destination: "/account/orders", permanent: false },
      { source: "/orders/success", destination: "/checkout/success", permanent: false },
      { source: "/account/affiliate", destination: "/account", permanent: false },
      { source: "/admin/coupons", destination: "/admin", permanent: false },
      { source: "/admin/analytics", destination: "/admin", permanent: false },
      { source: "/admin/reviews", destination: "/admin", permanent: false },
      { source: "/admin/affiliates", destination: "/admin", permanent: false },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;