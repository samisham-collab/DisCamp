// Drive mode: follows the camper along a route while DisCamp is open, works
// out the next turn on every GPS fix, and speaks each turn once. The screen
// stays on (see DriveKeepAwake). Guidance pauses if DisCamp goes to the
// background or the phone locks, and picks up when it comes back.

import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Coordinates } from '../types';
import { announcementFor, guidanceAt, trackFor, type Guidance } from './guidance';
import { describeError, log } from './log';
import type { RoutePlan } from './routing';

/** Headings from GPS are only meaningful when moving at least this fast (m/s, about 2 mph). */
const MIN_HEADING_SPEED = 1;

export interface DriveState {
  /** Null until the first GPS fix. */
  guidance: Guidance | null;
  /** Where the camper is and which way they're heading, for the map. */
  here: Coordinates | null;
  heading: number;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  /** Set if GPS couldn't be followed. */
  problem: string | null;
}

export function useDrive(plan: RoutePlan | null, destinationName: string, active: boolean): DriveState {
  const track = useMemo(() => (plan ? trackFor(plan.path) : null), [plan]);
  // Guidance belongs to the route it was worked out on, so a reroute starts clean.
  const [latest, setLatest] = useState<{ plan: RoutePlan; guidance: Guidance } | null>(null);
  const [here, setHere] = useState<Coordinates | null>(null);
  const [heading, setHeading] = useState(0);
  const [muted, setMutedState] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const mutedRef = useRef(false);
  const spoken = useRef(new Set<string>());
  const previousAlong = useRef<number | null>(null);
  const wasOffRoute = useRef(false);
  // Once there, stay arrived: the spot can be past the end of the road.
  const hasArrived = useRef(false);

  const say = useCallback((text: string) => {
    if (mutedRef.current) return;
    // iPhone: speech gets its own audio session, which lowers music or a
    // podcast while it talks. The Ring/Silent switch can still mute it.
    try {
      Speech.speak(text, { language: 'en-US', useApplicationAudioSession: false });
    } catch (error) {
      log.warn('Could not speak a direction', { error: describeError(error) });
    }
  }, []);

  const setMuted = useCallback((next: boolean) => {
    mutedRef.current = next;
    setMutedState(next);
    if (next) void Speech.stop().catch(() => undefined);
  }, []);

  // Each drive, and each new route (a reroute), starts its announcements fresh.
  useEffect(() => {
    spoken.current = new Set();
    previousAlong.current = null;
    wasOffRoute.current = false;
    hasArrived.current = false;
  }, [plan, active]);

  useEffect(() => {
    if (!active || !plan || !track) return undefined;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    const onFix = (fix: Location.LocationObject) => {
      if (cancelled) return;
      const at = { latitude: fix.coords.latitude, longitude: fix.coords.longitude };
      const found = guidanceAt(plan, track, at, {
        accuracy: fix.coords.accuracy,
        previousAlong: previousAlong.current,
      });
      if (found.arrived) hasArrived.current = true;
      const g = hasArrived.current ? { ...found, arrived: true, offRoute: false } : found;
      if (!g.offRoute) previousAlong.current = g.along;
      setHere(at);
      setProblem(null);
      if (fix.coords.heading != null && fix.coords.heading >= 0 && (fix.coords.speed ?? 0) >= MIN_HEADING_SPEED) {
        setHeading(fix.coords.heading);
      }
      setLatest({ plan, guidance: g });

      // "Off route" once each time the camper leaves the route.
      if (g.offRoute && !wasOffRoute.current && !g.arrived) say('Off route.');
      wasOffRoute.current = g.offRoute;

      const next = announcementFor(g, spoken.current, destinationName);
      if (next) {
        spoken.current.add(next.key);
        say(next.text);
      }
    };

    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 5 },
      onFix,
      (reason) => {
        log.warn('Drive mode lost GPS', { reason });
        if (!cancelled) setProblem('DisCamp lost your location. Guidance resumes when GPS comes back.');
      },
    ).then(
      (sub) => {
        if (cancelled) sub.remove();
        else subscription = sub;
      },
      (error: unknown) => {
        log.warn('Drive mode could not follow location', { error: describeError(error) });
        if (!cancelled) setProblem("DisCamp couldn't follow your location. Check that location is on for DisCamp.");
      },
    );

    return () => {
      cancelled = true;
      subscription?.remove();
      void Speech.stop().catch(() => undefined);
    };
  }, [active, plan, track, destinationName, say]);

  const guidance = latest && latest.plan === plan ? latest.guidance : null;
  return { guidance, here, heading, muted, setMuted, problem: active ? problem : null };
}
