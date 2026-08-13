import Link from "next/link";
import {
  buildWhatsAppUrl,
  SHOPEE_STORE_URL,
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
    <footer className="mt-auto border-t border-[var(--border)] bg-gradient-to-b from-[#111827] to-[#0f172a]">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <h3 className="text-lg font-bold tracking-tight text-white">{SITE_NAME}</h3>
            <p className="mt-1 text-sm text-slate-300">{SITE_TAGLINE}</p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
              Premium game account listings for popular titles. Pay securely by
              card through Stripe, or purchase via Shopee or WhatsApp.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Games
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-400">
              <li>
                <Link href="/#popular-games" className="transition duration-200 hover:text-white">
                  All games
                </Link>
              </li>
              {(games || []).map((game) => (
                <li key={game.slug}>
                  <Link
                    href={`/products?game=${game.slug}`}
                    className="transition duration-200 hover:text-white"
                  >
                    {game.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Quick links
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-400">
              <li>
                <Link href="/" className="transition hover:text-white">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/products" className="transition hover:text-white">
                  Accounts
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="transition hover:text-white">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/legal/terms" className="transition hover:text-white">
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="transition hover:text-white">
                  Privacy
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Support
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a
                  href={buildWhatsAppUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 transition hover:text-emerald-300"
                >
                  WhatsApp {WHATSAPP_DISPLAY}
                </a>
              </li>
              <li>
                <a
                  href={SHOPEE_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-300 transition hover:text-orange-200"
                >
                  Shopee store
                </a>
              </li>
              <li>
                <Link href="/legal/refund" className="text-slate-400 transition hover:text-white">
                  Refund policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-[var(--border)] pt-6 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
