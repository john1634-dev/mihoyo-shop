import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Footer from "@/components/Footer";
import ToastHost from "@/components/ToastHost";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import {
  SITE_NAME,
  SITE_DESCRIPTION,
  SITE_URL,
  SITE_TAGLINE,
} from "@/lib/config";
import { OG_IMAGE_PATH, absoluteUrl } from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "Baitu Games",
    "game accounts",
    "Genshin Impact account",
    "Honkai Star Rail account",
    "Zenless Zone Zero account",
    "Wuthering Waves account",
    "Malaysia game accounts",
  ],
  alternates: {
    canonical: SITE_URL.replace(/\/$/, "") + "/",
  },
  openGraph: {
    type: "website",
    locale: "en_MY",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [{ url: absoluteUrl(OG_IMAGE_PATH), alt: `${SITE_NAME} — ${SITE_TAGLINE}` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [absoluteUrl(OG_IMAGE_PATH)],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col overflow-x-hidden bg-[var(--background)] font-sans text-[var(--foreground)] antialiased`}
      >
        {children}
        <Footer />
        <FloatingWhatsApp />
        <ToastHost />
      </body>
    </html>
  );
}
