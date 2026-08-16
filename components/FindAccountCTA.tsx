"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  buildFindAccountWhatsAppMessage,
  buildWhatsAppUrl,
} from "@/lib/config";
import { CloseIcon, WhatsAppIcon } from "@/components/icons";

type GameOption = {
  id: string;
  name: string;
  slug: string;
};

type FindAccountCTAProps = {
  games: GameOption[];
  /** Prefill game name when opened from a game context */
  defaultGame?: string;
  className?: string;
  variant?: "primary" | "secondary" | "whatsapp";
  label?: string;
};

export default function FindAccountCTA({
  games,
  defaultGame = "",
  className = "",
  variant = "secondary",
  label = "Find Me an Account",
}: FindAccountCTAProps) {
  const [open, setOpen] = useState(false);
  const [game, setGame] = useState(defaultGame);
  const [budget, setBudget] = useState("");
  const [characterRequirement, setCharacterRequirement] = useState("");
  const [message, setMessage] = useState("");
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  function openDialog() {
    setGame(defaultGame);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    dialogRef.current?.querySelector<HTMLElement>("select,input,textarea")?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const href = buildWhatsAppUrl(
      buildFindAccountWhatsAppMessage({
        game,
        budget,
        characterRequirement,
        message,
      })
    );
    setOpen(false);
    window.open(href, "_blank", "noopener,noreferrer");
  }

  const buttonClass =
    variant === "primary"
      ? `btn-primary min-h-12 px-6 ${className}`
      : variant === "whatsapp"
        ? `btn-whatsapp min-h-12 px-6 ${className}`
        : `btn-secondary min-h-12 px-6 ${className}`;

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={buttonClass}
        aria-haspopup="dialog"
      >
        {label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Close find account form"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-card-hover)] sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <h2 id={titleId} className="text-lg font-semibold text-[var(--foreground)]">
                Find Me an Account
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--muted)] transition hover:text-[var(--foreground)]"
                aria-label="Close"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="overflow-y-auto px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            >
              <p className="text-sm leading-relaxed text-[var(--muted)]">
                Tell us what you need — we will open WhatsApp with your request.
                No order is created on this site.
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="find-account-game"
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"
                  >
                    Game
                  </label>
                  <select
                    id="find-account-game"
                    value={game}
                    onChange={(event) => setGame(event.target.value)}
                    className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent-strong)]"
                  >
                    <option value="">Select a game</option>
                    {games.map((item) => (
                      <option key={item.id} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="find-account-budget"
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"
                  >
                    Budget
                  </label>
                  <input
                    id="find-account-budget"
                    type="text"
                    value={budget}
                    onChange={(event) => setBudget(event.target.value)}
                    placeholder="e.g. RM500"
                    className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent-strong)]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="find-account-character"
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"
                  >
                    Character / account requirements
                  </label>
                  <input
                    id="find-account-character"
                    type="text"
                    value={characterRequirement}
                    onChange={(event) =>
                      setCharacterRequirement(event.target.value)
                    }
                    placeholder="e.g. Mavuika C6"
                    className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent-strong)]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="find-account-message"
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"
                  >
                    Optional message
                  </label>
                  <textarea
                    id="find-account-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="e.g. Good weapons"
                    rows={3}
                    className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent-strong)]"
                  />
                </div>
              </div>

              <button type="submit" className="btn-whatsapp mt-6 w-full min-h-12">
                <WhatsAppIcon className="h-4 w-4" />
                Continue on WhatsApp
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
