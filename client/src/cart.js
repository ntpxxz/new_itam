import { useSyncExternalStore } from 'react';

// รายการสั่งซื้อ cart: [{ key, qty }] keyed by catalog item key, kept in localStorage and shared by
// /shop, /cart and the topbar icon (same tab via listeners, other tabs via the storage event).
const KEY = 'itam.cart';
const listeners = new Set();

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
let cart = read();

function emit() { for (const l of listeners) l(); }

export function setCart(next) {
  cart = typeof next === 'function' ? next(cart) : next;
  try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch { /* storage unavailable */ }
  emit();
}

export const clearCart = () => setCart([]);

// Server limits per line: 9999 units, 200 for per-unit assets.
export const maxQty = (item) => (item?.kind === 'asset' ? 200 : 9999);

// qty is clamped to 0..max; 0 removes the line.
export const setLineQty = (key, qty, max) => setCart((c) => {
  const n = Math.max(0, Math.min(qty, max));
  if (!n) return c.filter((l) => l.key !== key);
  return c.some((l) => l.key === key) ? c.map((l) => (l.key === key ? { ...l, qty: n } : l)) : [...c, { key, qty: n }];
});

function subscribe(fn) {
  listeners.add(fn);
  const onStorage = (e) => { if (e.key === KEY) { cart = read(); emit(); } };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage); };
}

export const useCart = () => useSyncExternalStore(subscribe, () => cart);
