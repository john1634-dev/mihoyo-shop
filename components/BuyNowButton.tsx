"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addToCart } from "@/lib/cart";
import { supabase } from "@/lib/supabase";
import { toUserError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { CartItem } from "@/lib/types";

type ProductInfo = {
  id: string;
  title: string;
  price: number;
  currency: string;
  image?: string;
  cover_image_url?: string | null;
};

type BuyNowButtonProps = {
  product: ProductInfo;
  disabled?: boolean;
};

function toCartItem(product: ProductInfo): CartItem {
  return {
    id: product.id,
    title: product.title,
    price: Number(product.price),
    currency: product.currency || "MYR",
    image: product.image ?? product.cover_image_url ?? "",
    quantity: 1,
  };
}

export default function BuyNowButton({
  product,
  disabled = false,
}: BuyNowButtonProps) {
  const router = useRouter();
  const [added, setAdded] = useState(false);
  const [buying, setBuying] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  async function ensureAvailable(): Promise<boolean> {
    setChecking(true);
    setError("");

    const { data, error: statusError } = await supabase
      .from("products")
      .select("id, status, title, price, currency, cover_image_url")
      .eq("id", product.id)
      .maybeSingle();

    setChecking(false);

    if (statusError) {
      setError(toUserError(statusError.message));
      return false;
    }

    if (!data || data.status !== "available") {
      setError("This account is no longer available.");
      return false;
    }

    return true;
  }

  async function handleAddToCart() {
    if (disabled || buying || checking) return;

    const ok = await ensureAvailable();
    if (!ok) return;

    try {
      addToCart(toCartItem(product));
      setAdded(true);
      toast("Added to cart.", "success");
      window.setTimeout(() => setAdded(false), 2000);
    } catch {
      setError("Could not add to cart. Please try again.");
      toast("Could not add to cart.", "error");
    }
  }

  async function handleBuyNow() {
    if (disabled || buying || checking) return;

    const ok = await ensureAvailable();
    if (!ok) return;

    try {
      setBuying(true);
      addToCart(toCartItem(product));
      router.push("/checkout");
    } catch {
      setError("Could not start checkout. Please try again.");
      setBuying(false);
    }
  }

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className="w-full cursor-not-allowed rounded-xl bg-slate-800 px-6 py-4 font-semibold text-slate-500"
      >
        Sold Out
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleBuyNow}
        disabled={buying || checking}
        className="w-full rounded-xl bg-blue-600 px-6 py-4 font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {checking ? "Checking..." : buying ? "Redirecting..." : "Buy Now"}
      </button>

      <button
        type="button"
        onClick={handleAddToCart}
        disabled={buying || checking}
        className="w-full rounded-xl border border-slate-700 px-6 py-4 font-semibold transition hover:border-blue-500 hover:text-blue-400 disabled:opacity-60"
      >
        {added ? "Added to Cart ✓" : "Add to Cart"}
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
