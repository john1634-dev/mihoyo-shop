"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE_NAME } from "@/lib/config";

const NAV = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/games", label: "Games" },
  { href: "/admin/products", label: "Products" },
];

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLogin = pathname === "/admin/login";

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="min-w-0">
            <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
              ← {SITE_NAME}
            </Link>
            <p className="truncate text-sm font-semibold">Admin</p>
          </div>

          <nav className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            {NAV.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? "bg-white text-slate-950"
                      : "border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {children}
    </div>
  );
}
