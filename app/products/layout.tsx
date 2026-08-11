import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/config";

export const metadata: Metadata = {
  title: "Game Accounts",
  description: `Browse available game accounts at ${SITE_NAME}. ${SITE_DESCRIPTION}`,
  openGraph: {
    title: `Game Accounts | ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
  },
};

export default function ProductsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
