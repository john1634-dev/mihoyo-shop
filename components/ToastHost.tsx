"use client";

import { useEffect, useState } from "react";
import { subscribeToasts, type ToastPayload } from "@/lib/toast";

export default function ToastHost() {
  const [items, setItems] = useState<ToastPayload[]>([]);

  useEffect(() => {
    return subscribeToasts((payload) => {
      setItems((prev) => [...prev, payload].slice(-4));
      window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== payload.id));
      }, 3200);
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(100vw-2rem,22rem)] flex-col gap-2"
      aria-live="polite"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={
            "rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur " +
            (item.tone === "success"
              ? "border-emerald-800 bg-emerald-950/90 text-emerald-100"
              : item.tone === "error"
                ? "border-red-800 bg-red-950/90 text-red-100"
                : "border-slate-700 bg-slate-900/95 text-slate-100")
          }
          role="status"
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
