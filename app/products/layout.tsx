import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/config";
import { OG_IMAGE_PATH, absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Game Accounts",
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: `${SITE_URL.replace(/\/$/, "")}/products`,
  },
  openGraph: {
    title: `Game Accounts | ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
    url: `${SITE_URL.replace(/\/$/, "")}/products`,
    type: "website",
    siteName: SITE_NAME,
    images: [{ url: absoluteUrl(OG_IMAGE_PATH), alt: `${SITE_NAME} — Game Accounts` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Game Accounts | ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
    images: [absoluteUrl(OG_IMAGE_PATH)],
  },
};

export default function ProductsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
