"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { SITE_NAME, buildWhatsAppUrl } from "@/lib/config";
import { WhatsAppIcon, SearchIcon } from "@/components/icons";
import { supabase } from "@/lib/supabase";

type NavbarProps = {
  games?: { id: string; name: string; slug: string }[];
};

function MenuIcon() {
  return (
    <svg aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

export default function Navbar({ games = [] }: NavbarProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  useEffect(() => {
    if (!menuOpen) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    router.push(query ? `/products?q=${encodeURIComponent(query)}` : "/products");
    setMenuOpen(false);
    setMobileSearchOpen(false);
  }

  const closeMenu = () => setMenuOpen(false);

  return (
    <header
      className={`sticky top-0 z-50 border-b transition duration-200 ease-out ${
        scrolled
          ? "border-[var(--border)] bg-[#111827]/95 backdrop-blur-xl"
          : "border-transparent bg-[#111827]/80 backdrop-blur-md"
      }`}
    >
      <div className="mx-auto flex max-w-7xl min-w-0 items-center gap-3 px-4 py-3 md:px-6">
        <Link
          href="/"
          className="shrink-0 text-lg font-bold tracking-tight text-white"
        >
          {SITE_NAME}
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-slate-300 lg:flex" aria-label="Main">
          <Link href="/" className="transition hover:text-white">
            Home
          </Link>
          <Link href="/#popular-games" className="transition hover:text-white">
            Games
          </Link>
          <Link href="/products" className="transition hover:text-white">
            Accounts
          </Link>
          <Link href="/#faq" className="transition hover:text-white">
            FAQ
          </Link>
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
            className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-card)] px-4 py-2 text-sm outline-none transition focus:border-blue-500/50"
          />
        </form>

        <div className="flex shrink-0 items-center gap-2">
          <a
            href={buildWhatsAppUrl()}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat with us on WhatsApp"
            className="hidden min-h-11 items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-emerald-400/90 transition hover:border-emerald-600/35 hover:text-emerald-300 lg:inline-flex"
          >
            <WhatsAppIcon className="h-4 w-4" />
            <span className="hidden xl:inline">WhatsApp</span>
          </a>

          <button
            type="button"
            onClick={() => {
              setMobileSearchOpen((open) => !open);
              setMenuOpen(false);
            }}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--border)] text-slate-300 transition hover:border-slate-500 hover:text-white md:hidden"
            aria-label="Search"
            aria-expanded={mobileSearchOpen}
            aria-controls="mobile-nav-search-panel"
          >
            <SearchIcon className="h-4 w-4" />
          </button>

          {user && (
            <Link
              href="/account/wishlist"
              className="hidden min-h-11 items-center rounded-xl border border-[var(--border)] px-3 py-2 text-sm transition hover:border-slate-500 lg:inline-flex"
            >
              Wishlist
            </Link>
          )}

          {user ? (
            <Link
              href="/account"
              className="hidden min-h-11 items-center rounded-xl border border-[var(--border)] px-3 py-2 text-sm transition hover:border-slate-500 sm:inline-flex"
            >
              Account
            </Link>
          ) : (
            <Link
              href="/login"
              className="hidden min-h-11 items-center rounded-xl border border-[var(--border)] px-3 py-2 text-sm transition hover:border-slate-500 sm:inline-flex"
            >
              Login
            </Link>
          )}

          {isAdmin && (
            <Link
              href="/admin"
              className="hidden min-h-11 items-center rounded-xl border border-amber-800/40 px-3 py-2 text-sm text-amber-300 transition hover:border-amber-600 md:inline-flex"
            >
              Admin
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--border)] text-slate-200 lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {mobileSearchOpen && (
        <div
          id="mobile-nav-search-panel"
          className="border-t border-[var(--border)] px-4 py-3 md:hidden"
        >
          <form onSubmit={handleSearch} role="search">
            <label className="sr-only" htmlFor="mobile-nav-search-compact">
              Search accounts
            </label>
            <input
              id="mobile-nav-search-compact"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search accounts..."
              autoFocus
              className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-card)] px-4 py-2 text-sm outline-none transition focus:border-blue-500/50"
            />
          </form>
        </div>
      )}

      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu overlay"
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={closeMenu}
          />
          <nav
            id="mobile-nav-menu"
            className="relative z-50 max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-[var(--border)] bg-[#111827] px-4 py-4 lg:hidden"
            aria-label="Mobile"
          >
            <form onSubmit={handleSearch} className="mb-4">
              <label className="sr-only" htmlFor="mobile-nav-search">
                Search accounts
              </label>
              <input
                id="mobile-nav-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search accounts..."
                className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-card)] px-4 py-2.5 text-sm outline-none focus:border-blue-500/50"
              />
            </form>

            <div className="flex flex-col gap-1 text-base text-slate-200">
              {[
                { href: "/", label: "Home" },
                { href: "/#popular-games", label: "Games" },
                { href: "/products", label: "Accounts" },
                { href: "/#faq", label: "FAQ" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  className="flex min-h-11 items-center rounded-lg px-3 hover:bg-[var(--surface-card)]"
                >
                  {item.label}
                </Link>
              ))}
              {games.slice(0, 6).map((game) => (
                <Link
                  key={game.id}
                  href={`/products?game=${game.slug}`}
                  onClick={closeMenu}
                  className="flex min-h-11 items-center rounded-lg px-3 pl-5 text-slate-400 hover:bg-[var(--surface-card)]"
                >
                  {game.name}
                </Link>
              ))}
              {user && (
                <Link
                  href="/account/wishlist"
                  onClick={closeMenu}
                  className="flex min-h-11 items-center rounded-lg px-3 hover:bg-[var(--surface-card)]"
                >
                  Wishlist
                </Link>
              )}
              {user ? (
                <Link
                  href="/account"
                  onClick={closeMenu}
                  className="flex min-h-11 items-center rounded-lg px-3 hover:bg-[var(--surface-card)]"
                >
                  Account
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={closeMenu}
                    className="flex min-h-11 items-center rounded-lg px-3 hover:bg-[var(--surface-card)]"
                  >
                    Login
                  </Link>
                  <Link
                    href="/register"
                    onClick={closeMenu}
                    className="flex min-h-11 items-center rounded-lg px-3 hover:bg-[var(--surface-card)]"
                  >
                    Register
                  </Link>
                </>
              )}
              <a
                href={buildWhatsAppUrl()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeMenu}
                className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-emerald-300 hover:bg-[var(--surface-card)]"
              >
                <WhatsAppIcon className="h-4 w-4" />
                Chat on WhatsApp
              </a>
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={closeMenu}
                  className="flex min-h-11 items-center rounded-lg px-3 hover:bg-[var(--surface-card)]"
                >
                  Admin
                </Link>
              )}
            </div>
          </nav>
        </>
      )}
    </header>
  );
}
