// The camper's location, shared by every screen. DisCamp only asks for
// permission when the camper taps "Locate me", never on launch.

import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Linking } from 'react-native';

import type { Coordinates } from '../types';
import { isValidCoordinate } from './geo';
import { describeError, log } from './log';

export type LocationStatus = 'checking' | 'undetermined' | 'granted' | 'denied';

interface LocationContextValue {
  status: LocationStatus;
  coords: Coordinates | null;
  locating: boolean;
  /** Asks for permission if needed, then finds the camper. Null if it couldn't. */
  locate: () => Promise<Coordinates | null>;
}

const LocationContext = createContext<LocationContextValue | null>(null);

/** Longest wait for a GPS fix. */
const POSITION_TIMEOUT_MS = 15_000;
/** Longest wait for quick native checks (permission status, services, last fix). */
const CHECK_TIMEOUT_MS = 5_000;
const LAST_KNOWN_MAX_AGE_MS = 5 * 60_000;

/**
 * Resolves to `fallback` if `promise` hasn't settled within `ms`, so a native
 * call that never answers can't leave "Locate me" spinning forever.
 */
function orAfter<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

class LocationCheckTimeout extends Error {
  constructor() {
    super('Checking location permission timed out');
    this.name = 'LocationCheckTimeout';
  }
}

/** The current permission, or an error if the system doesn't answer. */
async function checkPermission(): Promise<Location.LocationPermissionResponse> {
  const permission = await orAfter(Location.getForegroundPermissionsAsync(), CHECK_TIMEOUT_MS, null);
  if (!permission) throw new LocationCheckTimeout();
  return permission;
}

function toCoords(position: Location.LocationObject | null): Coordinates | null {
  if (!position) return null;
  const c = { latitude: position.coords.latitude, longitude: position.coords.longitude };
  return isValidCoordinate(c) ? c : null;
}

/**
 * Not getting a fix is normal (indoors, in a canyon, or a simulator with no
 * location set). The phone reports it as a failure; DisCamp treats it as
 * "no fix yet", not an error.
 */
function noFix(step: string) {
  return (error: unknown): null => {
    log.info(`No location fix (${step})`, { error: describeError(error) });
    return null;
  };
}

/** A recent fix if there is one (fast), otherwise a fresh one. Null if none comes. */
async function currentPosition(): Promise<Coordinates | null> {
  const lastKnown = await orAfter(
    Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }).catch(noFix('last known')),
    CHECK_TIMEOUT_MS,
    null,
  );
  const recent = toCoords(lastKnown);
  if (recent) return recent;
  const fresh = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    .then(toCoords)
    .catch(noFix('current'));
  return orAfter(fresh, POSITION_TIMEOUT_MS, null);
}

function explainDenied() {
  Alert.alert(
    'Location is off for DisCamp',
    'Turn on location access in Settings to see how far away spots are. DisCamp works without it.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => void Linking.openSettings().catch(() => undefined) },
    ],
  );
}

function servicesOff() {
  Alert.alert('Location Services are off', 'Turn on Location Services in Settings to see spots near you.');
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LocationStatus>('checking');
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const busy = useRef<Promise<Coordinates | null> | null>(null);

  // On launch, use location only if the camper already allowed it. No prompt,
  // and no alerts: a quiet failure here just means no distances yet.
  useEffect(() => {
    let active = true;
    void (async () => {
      let permission: Location.LocationPermissionResponse;
      try {
        permission = await checkPermission();
      } catch (error) {
        log.warn('Could not check location permission on launch', { error: describeError(error) });
        if (active) setStatus('undetermined');
        return;
      }
      if (!active) return;
      if (permission.status !== 'granted') {
        setStatus(permission.status === 'denied' ? 'denied' : 'undetermined');
        return;
      }
      setStatus('granted');
      try {
        const found = await currentPosition();
        // A fix from "Locate me" may have arrived first; it's fresher, so keep it.
        if (active && found) setCoords((prev) => prev ?? found);
      } catch (error) {
        // Usually Location Services are off. "Locate me" explains that if tapped.
        log.warn('Could not find location on launch', { error: describeError(error) });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const locate = useCallback((): Promise<Coordinates | null> => {
    if (busy.current) return busy.current;
    const run = (async () => {
      setLocating(true);
      try {
        let permission = await checkPermission();
        let prompted = false;
        if (permission.status !== 'granted' && permission.canAskAgain) {
          // No timeout here: the camper may take a while to answer the system prompt.
          permission = await Location.requestForegroundPermissionsAsync();
          prompted = true;
        }
        if (permission.status !== 'granted') {
          setStatus('denied');
          // The camper just said no in the system prompt: respect that. Only
          // point to Settings when tapping again can't bring the prompt back.
          if (!prompted && !permission.canAskAgain) {
            // With Location Services off for the whole phone, iPhone reports
            // DisCamp as denied too; DisCamp's own settings can't fix that.
            const servicesOn = await orAfter(Location.hasServicesEnabledAsync(), CHECK_TIMEOUT_MS, true);
            if (servicesOn) explainDenied();
            else servicesOff();
          }
          return null;
        }
        setStatus('granted');
        const servicesOn = await orAfter(Location.hasServicesEnabledAsync(), CHECK_TIMEOUT_MS, true);
        if (!servicesOn) {
          servicesOff();
          return null;
        }
        const found = await currentPosition();
        if (!found) {
          Alert.alert("Couldn't find your location", 'Try again in a moment, ideally with a clear view of the sky.');
          return null;
        }
        setCoords(found);
        return found;
      } catch (error) {
        log.error('Locating failed', error);
        Alert.alert("Couldn't find your location", 'Try again in a moment.');
        return null;
      } finally {
        setLocating(false);
        busy.current = null;
      }
    })();
    busy.current = run;
    return run;
  }, []);

  const value = useMemo(() => ({ status, coords, locating, locate }), [status, coords, locating, locate]);
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used inside <LocationProvider>');
  return ctx;
}
