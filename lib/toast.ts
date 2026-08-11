/**
 * Lightweight toast events — no extra UI library.
 * Listen with useToast() / ToastHost.
 */
export type ToastTone = "success" | "error" | "info";

export type ToastPayload = {
  id: string;
  message: string;
  tone: ToastTone;
};

const EVENT = "gameslot-toast";

export function toast(message: string, tone: ToastTone = "info"): void {
  if (typeof window === "undefined") return;

  const detail: ToastPayload = {
    id: crypto.randomUUID(),
    message,
    tone,
  };

  window.dispatchEvent(new CustomEvent(EVENT, { detail }));
}

export function subscribeToasts(
  onToast: (payload: ToastPayload) => void
): () => void {
  function handler(event: Event) {
    const custom = event as CustomEvent<ToastPayload>;
    if (custom.detail) onToast(custom.detail);
  }

  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
