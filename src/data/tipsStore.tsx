// The tip jar's connection to the App Store or Google Play, for the whole
// app (Account shows it with TipJar). It lives at the app's root, not on the
// Account screen, so a tip that finishes paying later (Android's "pay with
// cash" tips, or one interrupted by closing the app) is still finished as
// soon as the store reports it: Google refunds tips that aren't finished
// within 3 days. Each time DisCamp comes back to the front, it checks the
// store for tips left unfinished. Only paid tips are ever finished.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

import { selectionFeedback } from '../lib/haptics';
import { describeError, log } from '../lib/log';
import { withDeadline } from '../lib/deadline';
import { iapModule, isTip, TIP_IDS, toTipProducts, type TipProduct } from '../lib/tips';

/** How long to wait for the App Store or Google Play to answer. */
const STORE_TIMEOUT_MS = 20_000;

/** off: no store here (Expo Go, the web). */
export type TipsPhase = 'off' | 'loading' | 'ready' | 'error';

interface TipsValue {
  phase: TipsPhase;
  products: TipProduct[];
  /** The tip being bought, if any. */
  buying: string | null;
  /** True after this camper's tip went through. */
  thanks: boolean;
  /** Something to tell the camper about their last try. */
  notice: string | null;
  tip: (id: string) => void;
  /** Connect to the store again, after it couldn't be reached. */
  retry: () => void;
}

const TipsContext = createContext<TipsValue | null>(null);

type Iap = NonNullable<ReturnType<typeof iapModule>>;
type Purchase = Parameters<Iap['finishTransaction']>[0]['purchase'];

export function TipsProvider({ children }: { children: ReactNode }) {
  const [iap] = useState(iapModule);
  const [phase, setPhase] = useState<TipsPhase>(iap ? 'loading' : 'off');
  const [products, setProducts] = useState<TipProduct[]>([]);
  const [buying, setBuying] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Read by the store's listeners, which outlive renders.
  const buyingRef = useRef<string | null>(null);
  const connected = useRef(false);
  // Purchases being finished, so the listener and the check on coming back
  // to the front never finish the same one twice.
  const finishing = useRef(new Set<string>());
  const mounted = useRef(true);

  /** Finishes a paid tip once. Resolves true when this call finished it. */
  const finish = useCallback(
    async (purchase: Purchase): Promise<boolean> => {
      if (!iap || purchase.purchaseState !== 'purchased' || !isTip(purchase.productId)) return false;
      const key = purchase.id || purchase.purchaseToken || purchase.productId;
      if (finishing.current.has(key)) return false;
      finishing.current.add(key);
      try {
        await iap.finishTransaction({ purchase, isConsumable: true });
        return true;
      } catch (error) {
        // Left for the next check, when DisCamp comes back to the front.
        finishing.current.delete(key);
        log.warn('Could not finish a tip', { error: describeError(error) });
        return false;
      }
    },
    [iap],
  );

  /** Finishes paid tips the store still holds (the app closed mid-purchase, or a tip paid later). */
  const sweep = useCallback(() => {
    if (!iap || !connected.current) return;
    iap
      .getAvailablePurchases()
      .then((left) => Promise.all(left.map((p) => finish(p))))
      .catch(() => undefined);
  }, [iap, finish]);

  const connect = useCallback(() => {
    if (!iap) return;
    // A store that never answers shows "can't reach the store" (with Try again), not a spinner forever.
    withDeadline(async () => {
      await iap.initConnection();
      return iap.fetchProducts({ skus: [...TIP_IDS], type: 'in-app' });
    }, STORE_TIMEOUT_MS).then(
      (list) => {
        connected.current = true;
        if (!mounted.current) return;
        const found = toTipProducts((list ?? []) as { id: string; title?: string; displayPrice: string }[]);
        setProducts(found);
        setPhase(found.length > 0 ? 'ready' : 'error');
        sweep();
      },
      (error: unknown) => {
        log.info('Could not load tips', { error: describeError(error) });
        if (mounted.current) setPhase('error');
      },
    );
  }, [iap, sweep]);

  useEffect(() => {
    mounted.current = true;
    if (!iap) return undefined;

    const updated = iap.purchaseUpdatedListener((purchase) => {
      if (!isTip(purchase.productId)) return;
      const asked = buyingRef.current === purchase.productId;
      if (purchase.purchaseState === 'pending') {
        // Paid later (cash at a store, on Android): finished once it's paid.
        if (!asked) return;
        buyingRef.current = null;
        setBuying(null);
        setNotice('Your tip is waiting for payment. Thank you! It goes through once it’s paid.');
        return;
      }
      if (purchase.purchaseState !== 'purchased') return;
      if (asked) buyingRef.current = null;
      void finish(purchase).then((done) => {
        if (!mounted.current || !asked) return;
        setBuying(null);
        // A tip from earlier that's only now finished gets no fuss.
        if (!done) return;
        setThanks(true);
        setNotice(null);
        selectionFeedback();
        AccessibilityInfo.announceForAccessibility('Thank you for your tip');
      });
    });

    const failed = iap.purchaseErrorListener((error) => {
      buyingRef.current = null;
      if (!mounted.current) return;
      setBuying(null);
      if (error.code === 'user-cancelled') return;
      log.info('Tip did not go through', { code: error.code });
      setNotice(
        error.code === 'network-error'
          ? "You're offline or the store can't be reached. Try again when you have signal."
          : "The tip didn't go through, and you weren't charged. Please try again.",
      );
    });

    connect();

    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (connected.current) sweep();
      else connect();
    });

    return () => {
      mounted.current = false;
      updated.remove();
      failed.remove();
      appState.remove();
      connected.current = false;
      void iap.endConnection().catch(() => undefined);
    };
  }, [iap, connect, sweep, finish]);

  const tip = useCallback(
    (id: string) => {
      // The ref, not state: two taps in one frame start one purchase.
      if (!iap || buyingRef.current) return;
      buyingRef.current = id;
      setBuying(id);
      setThanks(false);
      setNotice(null);
      iap
        .requestPurchase({ request: { apple: { sku: id }, google: { skus: [id] } }, type: 'in-app' })
        .catch((error: unknown) => {
          buyingRef.current = null;
          if (!mounted.current) return;
          setBuying(null);
          if ((error as { code?: unknown } | null)?.code === 'user-cancelled') return;
          log.info('Could not start a tip', { error: describeError(error) });
          setNotice("The store couldn't start the tip. Please try again.");
        });
    },
    [iap],
  );

  const retry = useCallback(() => {
    setPhase('loading');
    connect();
  }, [connect]);

  const value = useMemo(
    () => ({ phase, products, buying, thanks, notice, tip, retry }),
    [phase, products, buying, thanks, notice, tip, retry],
  );
  return <TipsContext.Provider value={value}>{children}</TipsContext.Provider>;
}

export function useTips(): TipsValue {
  const value = useContext(TipsContext);
  if (!value) throw new Error('useTips needs a TipsProvider above it (src/app/_layout.tsx).');
  return value;
}
