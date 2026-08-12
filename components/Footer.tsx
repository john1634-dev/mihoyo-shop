import Link from "next/link";
import {
  buildWhatsAppUrl,
  SHOPEE_STORE_URL,
  SITE_NAME,
  SITE_TAGLINE,
  WHATSAPP_DISPLAY,
} from "@/lib/config";

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-white/[0.06] bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-14 md:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <h3 className="text-lg font-bold tracking-tight">{SITE_NAME}</h3>
            <p className="mt-1 text-sm text-slate-400">{SITE_TAGLINE}</p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-500">
              Curated game accounts with clear details. Purchase via WhatsApp or
              Shopee.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Quick links
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-400">
              <li>
                <Link href="/products" className="transition hover:text-white">
                  Games
                </Link>
              </li>
              <li>
                <Link href="/products" className="transition hover:text-white">
                  Products
                </Link>
              </li>
              <li>
                <Link href="/account/wishlist" className="transition hover:text-white">
                  Wishlist
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Contact
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
                  Shopee Store
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Legal
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-400">
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
              <li>
                <Link href="/legal/refund" className="transition hover:text-white">
                  Refund
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/[0.06] pt-6 text-center text-sm text-slate-600">
          © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
