// The tip jar: DisCamp's only income. Tips are in-app purchases ("consumable":
// a camper can tip more than once) set up in App Store Connect and Google
// Play Console with the ids below (store/app-store-connect.md). A tip buys
// nothing: no badge, no Embers, no features. It just says thanks.
//
// Purchases need the App Store or Google Play version of DisCamp (or a
// development build). Expo Go has no store connection, so expo-iap loads
// lazily and the tip jar says where tipping works instead.

import type * as IapModule from 'expo-iap';
import { Platform } from 'react-native';

import { inExpoGo } from './expoGo';
import { describeError, log } from './log';

type Iap = typeof IapModule;

export interface TipOption {
  /** The product id in both stores. */
  id: string;
  /** Shown before the store answers, and if it leaves the title out. */
  label: string;
  /** The planned price, in US dollars (the store shows the real, local one). */
  usd: number;
}

export const TIP_OPTIONS: readonly TipOption[] = [
  { id: 'tip_small', label: 'Coffee at camp', usd: 2.99 },
  { id: 'tip_medium', label: 'A bundle of firewood', usd: 4.99 },
  { id: 'tip_large', label: 'A tank of gas', usd: 9.99 },
];

export const TIP_IDS: readonly string[] = TIP_OPTIONS.map((t) => t.id);

/** A tip as the store offers it here: its title and local price. */
export interface TipProduct {
  id: string;
  label: string;
  price: string;
}

/** expo-iap, or null where purchases can't work (web, Expo Go). */
export function iapModule(): Iap | null {
  if (Platform.OS === 'web' || inExpoGo()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-iap') as Iap;
  } catch (error) {
    log.info('In-app purchases are not in this build', { error: describeError(error) });
    return null;
  }
}

/** The store's products in DisCamp's order, with the planned label when the store's title is empty. */
export function toTipProducts(products: { id: string; title?: string | null; displayPrice: string }[]): TipProduct[] {
  return TIP_OPTIONS.flatMap((option) => {
    const product = products.find((p) => p.id === option.id);
    if (!product) return [];
    // Google Play adds " (DisCamp)" to titles; the app already says where you are.
    const title = (product.title ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    return [{ id: option.id, label: title || option.label, price: product.displayPrice }];
  });
}

/** True for a tip id, so the tip jar only finishes its own purchases. */
export function isTip(productId: string | null | undefined): boolean {
  return productId != null && TIP_IDS.includes(productId);
}
