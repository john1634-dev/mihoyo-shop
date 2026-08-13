"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SITE_NAME } from "@/lib/config";

const NAV = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/orders", label: "Orders", exact: false },
  { href: "/admin/inventory", label: "Inventory", exact: false },
  { href: "/admin/games", label: "Games", exact: false },
  { href: "/admin/products", label: "Products", exact: false },
];

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLogin = pathname === "/admin/login";
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (isLogin || !menuOpen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isLogin, menuOpen]);

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-950 text-white">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl min-w-0 items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <Link
              href="/"
              className="block truncate text-xs text-slate-500 hover:text-slate-300"
            >
              ← {SITE_NAME}
            </Link>
            <p className="truncate text-sm font-semibold">Admin</p>
          </div>

          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="admin-mobile-nav"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-200 md:hidden"
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>

          <nav className="hidden min-w-0 flex-wrap items-center justify-end gap-1.5 md:flex md:gap-2">
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

        {menuOpen && (
          <>
            <button
              type="button"
              aria-label="Close menu overlay"
              className="fixed inset-0 z-30 bg-black/60 md:hidden"
              onClick={closeMenu}
            />
            <nav
              id="admin-mobile-nav"
              className="relative z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-slate-800 px-4 py-3 md:hidden"
            >
              <ul className="space-y-2">
                {NAV.map((item) => {
                  const active = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={closeMenu}
                        className={`flex min-h-11 items-center rounded-lg px-4 text-base ${
                          active
                            ? "bg-white font-medium text-slate-950"
                            : "border border-slate-700 text-slate-200"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </>
        )}
      </header>

      <div className="min-w-0 overflow-x-hidden">{children}</div>
    </div>
  );
}
