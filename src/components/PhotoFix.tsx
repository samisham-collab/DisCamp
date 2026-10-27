// Where a cleanup photo was taken, for posting a cleanup (its pin) and for
// sending one (checked against the pin). The first GPS fix under trees or in
// a canyon is often weak, so DisCamp keeps listening for up to 30 seconds
// for one within 75 m, says how close it's got, and offers "Try again"
// instead of making the camper retake the photo. Only when the phone shares
// just an approximate location does it point to Settings.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';

import { MAX_FIX_ACCURACY_M, isRoughFix } from '../data/community';
import { useLocation } from '../lib/location';
import type { Fix } from '../types';
import { colors } from '../theme';
import { Banner, Button } from './ui';

/** How long to keep listening for a better fix. */
export const REFINE_MS = 30_000;

/** "45 m", "1.2 mi". */
function within(meters: number): string {
  return meters >= 1000 ? `${(meters / 1609.34).toFixed(1)} mi` : `${Math.round(meters)} m`;
}

export interface PhotoFix {
  fix: Fix | null;
  /** Listening for a fix right now. */
  finding: boolean;
  /** How close the best fix so far is, in meters (while finding). */
  soFar: number | null;
  /** A search finished (with or without a fix). */
  tried: boolean;
  /** The fix is too rough to use. */
  rough: boolean;
  approximate: boolean;
  /** Finds where the camper is now: right after a photo, or "Try again". */
  find: () => Promise<Fix | null>;
}

export function usePhotoFix(): PhotoFix {
  const { refine, approximate } = useLocation();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [fix, setFix] = useState<Fix | null>(null);
  const [finding, setFinding] = useState(false);
  const [soFar, setSoFar] = useState<number | null>(null);
  const [tried, setTried] = useState(false);
  // Each search has a number, so an old one finishing late changes nothing.
  const search = useRef(0);

  const find = useCallback(async () => {
    const mine = ++search.current;
    const current = () => mine === search.current && mounted.current;
    setFix(null);
    setFinding(true);
    setSoFar(null);
    setTried(false);
    try {
      const found = await refine(MAX_FIX_ACCURACY_M, REFINE_MS, (f) => {
        if (current() && f.accuracy != null) setSoFar(f.accuracy);
      });
      if (current()) setFix(found);
      return found;
    } finally {
      if (current()) {
        setFinding(false);
        setTried(true);
      }
    }
  }, [refine]);

  return { fix, finding, soFar, tried, rough: isRoughFix(fix), approximate, find };
}

/**
 * What's happening with the location, and the way forward when there's a
 * problem. Nothing while the fix is good (the screen says where it pinned).
 */
export function PhotoFixStatus({ state, purpose }: { state: PhotoFix; purpose: string }) {
  const { fix, finding, soFar, tried, rough, approximate, find } = state;
  const retry = <Button label="Try again" icon="locate-outline" kind="secondary" onPress={() => void find()} />;

  if (finding) {
    return (
      <View style={styles.finding} accessible accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.pine} />
        <Text style={styles.body}>
          Finding your location{soFar != null ? ` (within about ${within(soFar)} so far)` : ''}…
        </Text>
      </View>
    );
  }
  if (fix && rough && approximate) {
    return (
      <>
        <Banner
          tone="warning"
          icon="location-outline"
          message={`Your phone shares only an approximate location with DisCamp (within about ${within(fix.accuracy ?? 0)}). Turn on Precise Location for DisCamp in Settings, then tap Try again.`}
          actionLabel="Settings"
          onAction={() => void Linking.openSettings().catch(() => undefined)}
          announceKey="approximate"
        />
        {retry}
      </>
    );
  }
  if (fix && rough) {
    return (
      <>
        <Banner
          tone="warning"
          icon="location-outline"
          message={`GPS is weak here: DisCamp got within about ${within(fix.accuracy ?? 0)} and needs ${MAX_FIX_ACCURACY_M} m to ${purpose}. Step out from under trees or away from rock walls if you can, then tap Try again.`}
          announceKey={`weak-${Math.round(fix.accuracy ?? 0)}`}
        />
        {retry}
      </>
    );
  }
  if (!fix && tried) {
    return (
      <>
        <Banner
          tone="warning"
          icon="location-outline"
          message={`DisCamp couldn't find your location, and needs it to ${purpose}. Check that location is on for DisCamp, then tap Try again.`}
          announceKey="no-fix"
        />
        {retry}
      </>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  finding: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  body: { fontSize: 15, color: colors.body, lineHeight: 21, flexShrink: 1 },
});
