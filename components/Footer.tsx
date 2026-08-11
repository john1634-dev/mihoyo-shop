import Link from "next/link";
import {
  buildWhatsAppUrl,
  isWhatsAppConfigured,
  SITE_NAME,
} from "@/lib/config";

export default function Footer() {
  const whatsappUrl = isWhatsAppConfigured()
    ? buildWhatsAppUrl(
        `Hi ${SITE_NAME}, I have a question about an account.`
      )
    : null;

  return (
    <footer className="mt-auto border-t border-slate-800 bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-3">
          <div>
            <h3 className="text-lg font-bold">{SITE_NAME}</h3>
            <p className="mt-2 text-sm text-slate-400">
              Premium game accounts for Genshin Impact, Honkai: Star Rail,
              Zenless Zone Zero and Wuthering Waves.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-300">Shop</h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-400">
              <li>
                <Link href="/products" className="hover:text-white">
                  All Accounts
                </Link>
              </li>
              <li>
                <Link href="/cart" className="hover:text-white">
                  Shopping Cart
                </Link>
              </li>
              <li>
                <Link href="/checkout" className="hover:text-white">
                  Checkout
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-300">Support</h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-400">
              <li>Fast delivery & after-sales support</li>
              <li>Malaysia-based store</li>
              <li>
                {whatsappUrl ? (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-400 hover:text-green-300"
                  >
                    Contact via WhatsApp
                  </a>
                ) : (
                  <span>WhatsApp coming soon</span>
                )}
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-slate-800 pt-6 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
