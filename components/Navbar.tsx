"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  SITE_NAME,
  buildWhatsAppUrl,
} from "@/lib/config";
import { supabase } from "@/lib/supabase";

type NavbarProps = {
  games?: { id: string; name: string; slug: string }[];
};

export default function Navbar({ games = [] }: NavbarProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
      if (!session?.user) {
        setIsAdmin(false);
        return;
      }

      void supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", session.user.id)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (active) setIsAdmin(Boolean(profile?.is_admin));
        });
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    router.push(query ? `/products?q=${encodeURIComponent(query)}` : "/products");
    setMenuOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/70 bg-slate-950/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:px-6">
        <Link
          href="/"
          className="shrink-0 text-lg font-semibold tracking-tight text-white"
        >
          {SITE_NAME}
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-slate-300 lg:flex">
          <Link href="/" className="transition hover:text-white">
            Home
          </Link>
          <Link href="/products" className="transition hover:text-white">
            Accounts
          </Link>
          <a
            href={buildWhatsAppUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="transition hover:text-white"
          >
            Contact
          </a>
        </nav>

        <form
          onSubmit={handleSearch}
          className="ml-auto hidden max-w-xs flex-1 md:block lg:max-w-sm"
          role="search"
        >
          <label className="sr-only" htmlFor="nav-search">
            Search accounts
          </label>
          <input
            id="nav-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search accounts..."
            className="w-full rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-2 text-sm outline-none transition focus:border-blue-500/60"
          />
        </form>

        <div className="flex items-center gap-2">
          {user ? (
            <Link
              href="/account"
              className="hidden rounded-xl border border-slate-700 px-3 py-2 text-sm transition hover:border-slate-500 sm:inline-block"
            >
              Account
            </Link>
          ) : (
            <Link
              href="/login"
              className="hidden rounded-xl border border-slate-700 px-3 py-2 text-sm transition hover:border-slate-500 sm:inline-block"
            >
              Login
            </Link>
          )}

          {isAdmin && (
            <Link
              href="/admin"
              className="hidden rounded-xl border border-amber-800/50 px-3 py-2 text-sm text-amber-300 transition hover:border-amber-600 md:inline-block"
            >
              Admin
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded-xl border border-slate-700 px-3 py-2 text-sm lg:hidden"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="border-t border-slate-800 px-4 py-4 lg:hidden">
          <form onSubmit={handleSearch} className="mb-4">
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search accounts..."
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-blue-500/60"
            />
          </form>

          <div className="flex flex-col gap-3 text-sm text-slate-300">
            <Link href="/" onClick={() => setMenuOpen(false)}>
              Home
            </Link>
            <Link href="/products" onClick={() => setMenuOpen(false)}>
              Accounts
            </Link>
            {games.slice(0, 6).map((game) => (
              <Link
                key={game.id}
                href={`/products?game=${game.slug}`}
                onClick={() => setMenuOpen(false)}
              >
                {game.name}
              </Link>
            ))}
            {user && (
              <Link href="/account/wishlist" onClick={() => setMenuOpen(false)}>
                Wishlist
              </Link>
            )}
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
            <a
              href={buildWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
            >
              Contact on WhatsApp
            </a>
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
