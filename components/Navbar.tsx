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
  const cartCount = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setUser(data.user);

      if (data.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", data.user.id)
          .maybeSingle();
        if (active) setIsAdmin(Boolean(profile?.is_admin));
      } else {
        setIsAdmin(false);
      }
    }

    void loadUser();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) setIsAdmin(false);
      else {
        void supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", session.user.id)
          .maybeSingle()
          .then(({ data: profile }) => {
            if (active) setIsAdmin(Boolean(profile?.is_admin));
          });
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const desktopGames = games.slice(0, 5);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 md:px-6">
        <Link
          href="/"
          className="shrink-0 text-lg font-semibold tracking-tight text-white md:text-xl"
        >
          {SITE_NAME}
        </Link>

        <nav className="hidden items-center gap-5 text-sm text-slate-300 lg:flex">
          <Link href="/" className="transition hover:text-white">
            Home
          </Link>
          <Link href="/products" className="transition hover:text-white">
            Products
          </Link>
          {desktopGames.map((game) => (
            <Link
              key={game.id}
              href={`/products?game=${game.slug}`}
              className="max-w-[9rem] truncate transition hover:text-white"
              title={game.name}
            >
              {game.name}
            </Link>
          ))}
          {user && (
            <Link href="/account/wishlist" className="transition hover:text-white">
              Wishlist
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <Link
            href="/cart"
            className="relative rounded-lg border border-slate-700 px-3 py-2 text-sm transition hover:border-blue-500"
            aria-label={cartCount > 0 ? `Cart, ${cartCount} items` : "Cart"}
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

          {isAdmin && (
            <Link
              href="/admin"
              className="hidden rounded-lg border border-amber-800/60 px-3 py-2 text-sm text-amber-300 transition hover:border-amber-500 md:inline-block"
            >
              Admin
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm lg:hidden"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            <span aria-hidden="true">{menuOpen ? "Close" : "Menu"}</span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="max-h-[70vh] overflow-y-auto border-t border-slate-800 px-4 py-4 lg:hidden">
          <div className="flex flex-col gap-3 text-sm text-slate-300">
            <Link href="/" onClick={() => setMenuOpen(false)}>
              Home
            </Link>
            <Link href="/products" onClick={() => setMenuOpen(false)}>
              Products
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
            {user && (
              <>
                <Link href="/account/wishlist" onClick={() => setMenuOpen(false)}>
                  Wishlist
                </Link>
                <Link href="/account" onClick={() => setMenuOpen(false)}>
                  Account
                </Link>
              </>
            )}
            {!user && (
              <>
                <Link href="/login" onClick={() => setMenuOpen(false)}>
                  Login
                </Link>
                <Link href="/register" onClick={() => setMenuOpen(false)}>
                  Register
                </Link>
              </>
            )}
            {isAdmin && (
              <Link href="/admin" onClick={() => setMenuOpen(false)}>
                Admin
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
