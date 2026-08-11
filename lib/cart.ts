import type { CartItem } from "./types";

export const CART_STORAGE_KEY = "gameslot-cart";

export function loadCart(): CartItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const saved = localStorage.getItem(CART_STORAGE_KEY);

    if (!saved) {
      return [];
    }

    const cart = JSON.parse(saved);

    if (!Array.isArray(cart)) {
      return [];
    }

    return cart
      .filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.title === "string" &&
          Number.isFinite(Number(item.price))
      )
      .map((item) => ({
        id: item.id,
        title: item.title,
        price: Number(item.price),
        currency: item.currency || "MYR",
        image: typeof item.image === "string" ? item.image : "",
        quantity: 1,
      }));
  } catch {
    return [];
  }
}

export function saveCart(cart: CartItem[]): void {
  const normalized = cart.map((item) => ({
    ...item,
    quantity: 1,
    price: Number(item.price),
  }));

  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new Event("cart-updated"));
}

export function clearCart(): void {
  localStorage.removeItem(CART_STORAGE_KEY);
  window.dispatchEvent(new Event("cart-updated"));
}

export function addToCart(item: CartItem): CartItem[] {
  const cart = loadCart();
  const existingIndex = cart.findIndex((entry) => entry.id === item.id);

  if (existingIndex < 0) {
    cart.push({
      ...item,
      quantity: 1,
      price: Number(item.price),
    });
  }

  saveCart(cart);
  return cart;
}

export function getCartTotal(cart: CartItem[]): number {
  return cart.reduce(
    (sum, item) => sum + Number(item.price) * Number(item.quantity || 1),
    0
  );
}

export function getCartCount(cart: CartItem[]): number {
  return cart.length;
}
