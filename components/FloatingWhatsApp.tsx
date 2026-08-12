"use client";

import { buildWhatsAppUrl } from "@/lib/config";
import { WhatsAppIcon } from "@/components/icons";

export default function FloatingWhatsApp() {
  return (
    <a
      href={buildWhatsAppUrl()}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      title="Chat with us"
      className="floating-whatsapp fixed right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-600/95 text-white shadow-lg shadow-emerald-950/30 transition duration-200 ease-out hover:bg-emerald-500 sm:right-6"
    >
      <WhatsAppIcon className="h-5 w-5" />
    </a>
  );
}
