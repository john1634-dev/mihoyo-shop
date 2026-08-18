import Link from "next/link";
import {
  buildWhatsAppUrl,
  SITE_NAME,
  SITE_TAGLINE,
  WHATSAPP_DISPLAY,
} from "@/lib/config";
import { supabase } from "@/lib/supabase";

export default async function Footer() {
  const { data: games } = await supabase
    .from("games")
    .select("name, slug")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--footer-bg)]">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <h3 className="text-lg font-bold tracking-tight text-[var(--foreground)]">
              {SITE_NAME}
            </h3>
            <p className="mt-1 text-sm text-[var(--muted-strong)]">{SITE_TAGLINE}</p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--muted)]">
              Premium game account listings for popular titles. Pay securely by
              card through Stripe, or enquire on WhatsApp.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">
              Games
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm text-[var(--muted)]">
              <li>
                <Link
                  href="/#popular-games"
                  className="transition duration-200 hover:text-[var(--foreground)]"
                >
                  All games
                </Link>
              </li>
              {(games || []).map((game) => (
                <li key={game.slug}>
                  <Link
                    href={`/products?game=${game.slug}`}
                    className="transition duration-200 hover:text-[var(--foreground)]"
                  >
                    {game.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">
              Quick links
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm text-[var(--muted)]">
              <li>
                <Link href="/" className="transition hover:text-[var(--foreground)]">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/products" className="transition hover:text-[var(--foreground)]">
                  Accounts
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="transition hover:text-[var(--foreground)]">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/legal/terms" className="transition hover:text-[var(--foreground)]">
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="transition hover:text-[var(--foreground)]">
                  Privacy
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">
              Support
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a
                  href={buildWhatsAppUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-300 transition hover:text-emerald-200"
                >
                  WhatsApp {WHATSAPP_DISPLAY}
                </a>
              </li>
              <li>
                <Link
                  href="/legal/refund"
                  className="text-[var(--muted)] transition hover:text-[var(--foreground)]"
                >
                  Refund policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-[var(--border)] pt-6 text-center text-sm text-[var(--muted)]">
          © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
