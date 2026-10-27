// Test stand-in for expo-iap: a store with DisCamp's three tips. A purchase
// answers through the listeners, like the real store, with what
// `state.next` says: 'purchased', 'pending', 'cancelled' or 'failed'.

import { jest } from '@jest/globals';

interface Product {
  id: string;
  title: string;
  displayPrice: string;
}

interface Purchase {
  id: string;
  productId: string;
  purchaseState: 'purchased' | 'pending' | 'unknown';
}

interface PurchaseError {
  code: string;
  message: string;
}

const PRODUCTS: Product[] = [
  { id: 'tip_large', title: 'A tank of gas (DisCamp)', displayPrice: '$9.99' },
  { id: 'tip_small', title: 'Coffee at camp', displayPrice: '$2.99' },
  { id: 'tip_medium', title: '', displayPrice: '$4.99' },
];

export const state = {
  products: [...PRODUCTS],
  connectFails: false,
  /** Unfinished purchases the store still holds. */
  left: [] as Purchase[],
  next: 'purchased' as 'purchased' | 'pending' | 'unknown' | 'silent' | 'cancelled' | 'failed' | 'offline' | 'refused',
  updated: new Set<(p: Purchase) => void>(),
  failed: new Set<(e: PurchaseError) => void>(),
};

export function reset(): void {
  state.products = [...PRODUCTS];
  state.connectFails = false;
  state.left = [];
  state.next = 'purchased';
  state.updated.clear();
  state.failed.clear();
}

/** The store reports a purchase (a replayed one, say) to the listeners. */
export function emitPurchase(purchase: Purchase): void {
  for (const listener of [...state.updated]) listener(purchase);
}

export function emitError(error: PurchaseError): void {
  for (const listener of [...state.failed]) listener(error);
}

export const initConnection = jest.fn(async () => {
  if (state.connectFails) throw new Error('Billing is unavailable');
  return true;
});

export const endConnection = jest.fn(async () => true);

export const fetchProducts = jest.fn(async ({ skus }: { skus: string[]; type?: string }) =>
  state.products.filter((p) => skus.includes(p.id)),
);

export const getAvailablePurchases = jest.fn(async () => [...state.left]);

export const finishTransaction = jest.fn(async (_args: { purchase: Purchase; isConsumable?: boolean }) => undefined);

export const purchaseUpdatedListener = jest.fn((listener: (p: Purchase) => void) => {
  state.updated.add(listener);
  return { remove: () => state.updated.delete(listener) };
});

export const purchaseErrorListener = jest.fn((listener: (e: PurchaseError) => void) => {
  state.failed.add(listener);
  return { remove: () => state.failed.delete(listener) };
});

export const requestPurchase = jest.fn(
  async ({ request }: { request: { apple?: { sku: string }; google?: { skus: string[] } }; type: string }) => {
    const sku = request.apple?.sku ?? request.google?.skus[0] ?? '';
    if (state.next === 'refused') throw new Error('The store is not ready');
    await Promise.resolve();
    // "silent": the store never answers.
    if (state.next === 'silent') return;
    if (state.next === 'purchased' || state.next === 'pending' || state.next === 'unknown') {
      emitPurchase({ id: `txn-${sku}`, productId: sku, purchaseState: state.next });
    } else if (state.next === 'cancelled') {
      emitError({ code: 'user-cancelled', message: 'Cancelled' });
    } else if (state.next === 'offline') {
      emitError({ code: 'network-error', message: 'Offline' });
    } else {
      emitError({ code: 'service-error', message: 'Store error' });
    }
    return null;
  },
);
