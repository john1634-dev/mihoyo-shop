import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ToastHost from "@/components/ToastHost";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import {
  SITE_NAME,
  SITE_DESCRIPTION,
  SITE_URL,
  SITE_TAGLINE,
} from "@/lib/config";
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
    "Gameslot",
    "game account catalogue",
    "Genshin Impact account",
    "Honkai Star Rail account",
    "Zenless Zone Zero account",
    "Wuthering Waves account",
    "Malaysia game accounts",
    "WhatsApp",
    "Shopee",
  ],
  openGraph: {
    type: "website",
    locale: "en_MY",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
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
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen overflow-x-hidden bg-slate-950 font-sans text-white antialiased`}
      >
        {children}
        <FloatingWhatsApp />
        <ToastHost />
      </body>
    </html>
  );
}
