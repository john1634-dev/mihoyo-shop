"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { getCartCount, loadCart } from "@/lib/cart";
import { SITE_NAME } from "@/lib/config";
import { supabase } from "@/lib/supabase";

type NavbarProps = {
  games?: { id: string; name: string; slug: string }[];
};

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("cart-updated", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("cart-updated", onStoreChange);
  };
}

function getSnapshot() {
  return getCartCount(loadCart());
}

function getServerSnapshot() {
  return 0;
}

export default function Navbar({ games = [] }: NavbarProps) {
  const cartCount = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (active) setUser(data.user);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 md:px-6">
        <Link href="/" className="text-xl font-bold tracking-tight md:text-2xl">
          {SITE_NAME}
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-slate-300 lg:flex">
          <Link href="/" className="transition hover:text-white">
            Home
          </Link>
          <Link href="/products" className="transition hover:text-white">
            All Accounts
          </Link>
          {games.map((game) => (
            <Link
              key={game.id}
              href={`/products?game=${game.slug}`}
              className="transition hover:text-white"
            >
              {game.name}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/cart"
            className="relative rounded-lg border border-slate-700 px-3 py-2 text-sm transition hover:border-blue-500"
          >
            Cart
            {cartCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-xs font-bold">
                {cartCount}
              </span>
            )}
          </Link>

          {user ? (
            <Link
              href="/account"
              className="hidden rounded-lg border border-slate-700 px-3 py-2 text-sm transition hover:border-blue-500 sm:inline-block"
            >
              Account
            </Link>
          ) : (
            <Link
              href="/login"
              className="hidden rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium transition hover:bg-blue-500 sm:inline-block"
            >
              Login
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm lg:hidden"
            aria-label="Toggle menu"
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="border-t border-slate-800 px-4 py-4 lg:hidden">
          <div className="flex flex-col gap-3 text-sm text-slate-300">
            <Link href="/" onClick={() => setMenuOpen(false)}>
              Home
            </Link>
            <Link href="/products" onClick={() => setMenuOpen(false)}>
              All Accounts
            </Link>
            {games.map((game) => (
              <Link
                key={game.id}
                href={`/products?game=${game.slug}`}
                onClick={() => setMenuOpen(false)}
              >
                {game.name}
              </Link>
            ))}
            {user ? (
              <Link href="/account" onClick={() => setMenuOpen(false)}>
                Account
              </Link>
            ) : (
              <>
                <Link href="/login" onClick={() => setMenuOpen(false)}>
                  Login
                </Link>
                <Link href="/register" onClick={() => setMenuOpen(false)}>
                  Register
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
