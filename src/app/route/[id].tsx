// Route preview and Drive mode: the drive from the camper to a spot, drawn on
// DisCamp's map (Apple Maps or Google Maps underneath) and worked out for
// their rig. Start turns it into turn-by-turn guidance inside DisCamp, spoken
// aloud, while the app is open; the phone's maps app is one tap away too.

import { useKeepAwake } from 'expo-keep-awake';
import { Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/RouteMap';
import { SpotMissing } from '@/components/SpotMissing';
import { Banner, Button, IconButton, SectionTitle } from '@/components/ui';
import { useSpot } from '@/data/spots';
import { shortDistance } from '@/lib/guidance';
import { openDirections } from '@/lib/links';
import { useLocation } from '@/lib/location';
import { usePrefs } from '@/lib/prefs';
import { useFitRig, useRig } from '@/lib/rig';
import { rigDisplayName } from '@/lib/rigModel';
import {
  costingFor,
  fetchRoute,
  formatDriveTime,
  ROUTE_ERROR_MESSAGES,
  RouteError,
  routeSummary,
  type RouteErrorKind,
  type RoutePlan,
  type RouteStep,
} from '@/lib/routing';
import { useDrive, type DriveState } from '@/lib/useDrive';
import type { Spot } from '@/types';
import { colors, TOUCH_TARGET } from '@/theme';

type RouteState =
  | { phase: 'locating' }
  | { phase: 'routing' }
  | { phase: 'ready'; plan: RoutePlan }
  | { phase: 'no-location' }
  | { phase: 'error'; kind: RouteErrorKind };

const MAPS_APP = Platform.OS === 'ios' ? 'Apple Maps' : 'Google Maps';

/** "6.2", or "0.3" for short stretches. */
function miles(n: number): string {
  return n < 10 ? n.toFixed(1) : String(Math.round(n));
}

/** No first GPS fix after this long in Drive mode: say what might be wrong. */
const GPS_PATIENCE_MS = 30_000;

/** "0.3 mi", "12 mi", "Under 0.1 mi". */
function stepMiles(n: number): string {
  return n < 0.1 ? 'Under 0.1 mi' : `${miles(n)} mi`;
}

/** The written turn-by-turn list: every turn, how far, and rough stretches in words (not just orange). */
function TurnList({ steps }: { steps: RouteStep[] }) {
  const [open, setOpen] = useState(false);
  const turns = steps.filter((s) => !s.arrive && s.instruction);
  if (turns.length === 0) return null;
  return (
    <View style={styles.turns}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.turnsToggle, pressed && styles.pressed]}
      >
        <Text style={styles.turnsToggleText}>
          {open ? 'Hide' : 'Show'} turn by turn ({turns.length} {turns.length === 1 ? 'step' : 'steps'})
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.turnRows}>
          <SectionTitle>Turn by turn</SectionTitle>
          {turns.map((s, i) => (
            <View
              key={`${s.begin}-${i}`}
              style={styles.turnRow}
              accessible
              accessibilityLabel={`${i + 1}. ${s.instruction} ${stepMiles(s.miles)}.${s.rough ? ' Unpaved or rough.' : ''}${s.gate ? ' Mapped gate.' : ''}`}
            >
              <Text style={styles.turnNumber}>{i + 1}.</Text>
              <View style={styles.turnText}>
                <Text style={styles.body}>{s.instruction}</Text>
                <Text style={[styles.note, s.rough && styles.roughNote]}>
                  {stepMiles(s.miles)}
                  {s.rough ? ' · unpaved or rough' : ''}
                  {s.gate ? ' · mapped gate' : ''}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Keeps the screen on while Drive mode is showing. */
function DriveKeepAwake() {
  useKeepAwake('discamp-drive');
  return null;
}

export default function RoutePreviewScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { spot, loading } = useSpot(id);
  const fitRig = useFitRig();
  const { rig } = useRig();
  const { locate } = useLocation();
  const { prefs } = usePrefs();
  const insets = useSafeAreaInsets();
  const [satellite, setSatellite] = useState(prefs.mapType === 'hybrid');
  const [state, setState] = useState<RouteState>({ phase: 'locating' });
  const [driving, setDriving] = useState(false);
  const [following, setFollowing] = useState(true);
  const [rerouting, setRerouting] = useState(false);
  const [rerouteProblem, setRerouteProblem] = useState<string | null>(null);
  const navigation = useNavigation();

  // The spot as it was when the route was worked out: if a refresh drops it
  // mid-drive (hidden after reports, say), guidance carries on to it.
  const [kept, setKept] = useState<Spot | null>(spot ?? null);
  if (spot && spot !== kept) setKept(spot);
  const target = spot ?? (driving ? kept : null);

  const plan = state.phase === 'ready' ? state.plan : null;
  const drive = useDrive(plan, target?.name ?? 'the spot', driving);
  const inDrive = driving && plan != null;

  // Back, a swipe or Android's back button mid-drive: ask before guidance stops.
  usePreventRemove(inDrive, ({ data }) => {
    Alert.alert('End Drive mode?', 'Turn-by-turn guidance and the voice stop.', [
      { text: 'Keep driving', style: 'cancel' },
      { text: 'End', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const mounted = useRef(true);
  const runs = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const start = useCallback(async () => {
    if (!spot) return;
    const run = ++runs.current;
    const current = () => mounted.current && run === runs.current;
    setState({ phase: 'locating' });
    const here = await locate();
    if (!current()) return;
    if (!here) {
      setState({ phase: 'no-location' });
      AccessibilityInfo.announceForAccessibility('DisCamp needs your location to work out a route.');
      return;
    }
    setState({ phase: 'routing' });
    try {
      const found = await fetchRoute(here, spot, fitRig);
      if (!current()) return;
      setState({ phase: 'ready', plan: found });
      AccessibilityInfo.announceForAccessibility(`Route ready: ${routeSummary(found)}`);
    } catch (error) {
      if (!current()) return;
      const kind = error instanceof RouteError ? error.kind : 'unavailable';
      setState({ phase: 'error', kind });
      AccessibilityInfo.announceForAccessibility(ROUTE_ERROR_MESSAGES[kind]);
    }
  }, [spot, fitRig, locate]);

  // Once, when the spot is known (not again when the spot list refreshes).
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!spot || startedFor.current === spot.id) return;
    startedFor.current = spot.id;
    void start();
  }, [spot, start]);

  const reroute = useCallback(async () => {
    if (!target || !drive.here || rerouting) return;
    setRerouting(true);
    setRerouteProblem(null);
    try {
      const found = await fetchRoute(drive.here, target, fitRig, { fresh: true });
      if (mounted.current) setState({ phase: 'ready', plan: found });
    } catch (error) {
      const kind = error instanceof RouteError ? error.kind : 'unavailable';
      if (mounted.current) setRerouteProblem(ROUTE_ERROR_MESSAGES[kind]);
    } finally {
      if (mounted.current) setRerouting(false);
    }
  }, [target, drive.here, fitRig, rerouting]);

  const startDriving = () => {
    setFollowing(true);
    setRerouteProblem(null);
    setDriving(true);
  };
  const endDriving = () => {
    setDriving(false);
    setFollowing(true);
  };

  if (!target) {
    return (
      <>
        <Stack.Screen options={{ title: loading ? 'Loading' : 'Route' }} />
        <SpotMissing loading={loading} />
      </>
    );
  }

  const spotHere = target;
  const follow = inDrive && following && drive.here ? { center: drive.here, heading: drive.heading } : null;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Route preview', headerShown: !inDrive, gestureEnabled: !inDrive }} />
      {inDrive ? <DriveKeepAwake /> : null}
      <View style={styles.mapWrap}>
        <RouteMap
          path={plan?.path ?? []}
          roughSegments={plan?.roughSegments ?? []}
          destination={{ latitude: spotHere.latitude, longitude: spotHere.longitude, name: spotHere.name }}
          satellite={satellite}
          follow={follow}
          onUserPan={inDrive ? () => setFollowing(false) : undefined}
        />
        {inDrive ? (
          <View style={[styles.driveTop, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
            <DriveBanner
              drive={drive}
              spot={spotHere}
              rerouting={rerouting}
              rerouteProblem={rerouteProblem}
              onReroute={() => void reroute()}
              onDone={endDriving}
            />
          </View>
        ) : null}
        <View style={[styles.mapControls, inDrive && { top: undefined, bottom: 12 }]}>
          <IconButton
            icon="layers-outline"
            label={satellite ? 'Show standard map' : 'Show satellite map'}
            active={satellite}
            onPress={() => setSatellite((s) => !s)}
          />
          {inDrive && !following ? (
            <IconButton icon="navigate-outline" label="Re-center" onPress={() => setFollowing(true)} />
          ) : null}
        </View>
      </View>

      {inDrive ? (
        <View style={[styles.driveBar, { paddingBottom: insets.bottom + 10 }]}>
          <Text style={styles.driveLeft}>
            {drive.guidance
              ? `${shortDistance(drive.guidance.remainingMeters)} · ${formatDriveTime(drive.guidance.remainingMinutes)} left`
              : routeSummary(plan)}
          </Text>
          <IconButton
            icon={drive.muted ? 'volume-mute-outline' : 'volume-high-outline'}
            label={drive.muted ? 'Turn voice on' : 'Mute voice'}
            active={drive.muted}
            onPress={() => drive.setMuted(!drive.muted)}
          />
          <Button label="End" kind="secondary" onPress={endDriving} />
        </View>
      ) : (
        <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetBody}>
          <Text style={styles.name} accessibilityRole="header">
            {spotHere.name}
          </Text>

          {state.phase === 'locating' || state.phase === 'routing' ? (
            <View style={styles.working} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.pine} />
              <Text style={styles.body}>
                {state.phase === 'locating' ? 'Finding your location…' : 'Working out a route for your rig…'}
              </Text>
            </View>
          ) : null}

          {plan ? (
            <>
              <Text style={styles.summary} accessibilityLiveRegion="polite">
                {routeSummary(plan)}
              </Text>
              {plan.roughMiles >= 0.1 ? (
                <View style={styles.legend}>
                  <View style={styles.roughSwatch} accessibilityElementsHidden importantForAccessibility="no" />
                  <Text style={styles.body}>
                    About {miles(plan.roughMiles)} mi unpaved or rough (orange dashes on the map)
                  </Text>
                </View>
              ) : null}
              {plan.gates > 0 ? (
                <Banner
                  tone="warning"
                  message={`The route passes ${plan.gates === 1 ? 'a mapped gate' : `${plan.gates} mapped gates`}. Gates on back roads can be locked.`}
                />
              ) : null}
              {plan.ferry ? <Text style={styles.body}>Includes a ferry crossing.</Text> : null}
              {plan.toll ? <Text style={styles.body}>Includes a toll road.</Text> : null}
              <Text style={styles.body}>
                Routed for {rigDisplayName(rig)}. {costingFor(fitRig).summary}
              </Text>
              <TurnList steps={plan.steps} />
              <Banner
                tone="info"
                message="Back roads can be missing or wrong on the map, and drive times there run long. Check the spot's directions and recent check-ins before you go."
              />
              <Button label="Start" icon="navigate" onPress={startDriving} />
              <Text style={styles.note}>
                DisCamp speaks each turn while it&apos;s open on screen. Start before you drive, and keep your eyes on
                the road.
              </Text>
              <Button
                label={`Open in ${MAPS_APP}`}
                icon="open-outline"
                kind="secondary"
                onPress={() => void openDirections(spotHere)}
              />
            </>
          ) : null}

          {state.phase === 'no-location' ? (
            <>
              <Text style={styles.body}>DisCamp needs your location to work out a route.</Text>
              <Button label="Try again" icon="refresh" kind="secondary" onPress={() => void start()} />
              <Button
                label={`Directions in ${MAPS_APP}`}
                icon="navigate-outline"
                onPress={() => void openDirections(spotHere)}
              />
            </>
          ) : null}

          {state.phase === 'error' ? (
            <>
              <Text style={styles.body}>{ROUTE_ERROR_MESSAGES[state.kind]}</Text>
              {state.kind !== 'off' ? (
                <Button label="Try again" icon="refresh" kind="secondary" onPress={() => void start()} />
              ) : null}
              <Button
                label={`Directions in ${MAPS_APP}`}
                icon="navigate-outline"
                onPress={() => void openDirections(spotHere)}
              />
            </>
          ) : null}

          <Text style={styles.credit}>Route by Valhalla · Road data © OpenStreetMap contributors</Text>
        </ScrollView>
      )}
    </View>
  );
}

/** The card at the top in Drive mode: the next turn, or what's wrong. */
function DriveBanner({
  drive,
  spot,
  rerouting,
  rerouteProblem,
  onReroute,
  onDone,
}: {
  drive: DriveState;
  spot: Spot;
  rerouting: boolean;
  rerouteProblem: string | null;
  onReroute: () => void;
  onDone: () => void;
}) {
  const g = drive.guidance;
  // No fix for a while: say what might be wrong instead of spinning on.
  const [waitedLong, setWaitedLong] = useState(false);
  const waiting = g == null;
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setTimeout(() => setWaitedLong(true), GPS_PATIENCE_MS);
    return () => {
      clearTimeout(timer);
      // Fixes are coming: the next wait (after a reroute, say) starts patient again.
      setWaitedLong(false);
    };
  }, [waiting]);
  // The voice says each turn; screen readers hear the card change only when
  // the voice is muted, so they don't talk over each other.
  const live = drive.muted ? 'polite' : 'none';

  if (g?.arrived) {
    return (
      <View style={styles.driveCard} accessibilityLiveRegion="assertive">
        <Text style={styles.driveDistance}>You&apos;ve arrived</Text>
        <Text style={styles.driveInstruction}>{spot.name}</Text>
        <Button label="Done" icon="checkmark" onPress={onDone} />
      </View>
    );
  }

  if (g?.offRoute) {
    return (
      <View style={[styles.driveCard, styles.driveCardWarn]} accessibilityLiveRegion="assertive">
        <Text style={styles.driveDistance}>Off route</Text>
        <Text style={styles.driveInstruction}>
          {rerouteProblem ?? 'Get back on the blue line, or work out a new route from here.'}
        </Text>
        <Button label="Reroute" icon="refresh" loading={rerouting} onPress={onReroute} />
      </View>
    );
  }

  let warning: string | null = null;
  if (g?.onRough) warning = 'On unpaved or rough road';
  else if (g?.gateAheadMeters != null) warning = `Mapped gate in ${shortDistance(g.gateAheadMeters)}`;
  else if (g?.roughAheadMeters != null) warning = `Unpaved road in ${shortDistance(g.roughAheadMeters)}`;

  return (
    <View style={styles.driveCard}>
      {drive.problem ? (
        <Text style={styles.driveProblem} accessibilityRole="alert">
          {drive.problem}
        </Text>
      ) : null}
      {g ? (
        <>
          <Text style={styles.driveDistance}>{shortDistance(g.metersToNext)}</Text>
          <Text style={styles.driveInstruction} accessibilityLiveRegion={live}>
            {g.next && !g.next.arrive && g.next.instruction ? g.next.instruction : `Continue to ${spot.name}`}
          </Text>
          {warning ? <Text style={styles.driveWarning}>{warning}</Text> : null}
        </>
      ) : (
        <View style={styles.working} accessible accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.pine} />
          <Text style={styles.body}>
            {waitedLong
              ? 'Still waiting for GPS. Check that location is on for DisCamp, and keep the phone where it can see the sky.'
              : 'Waiting for GPS…'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  mapWrap: { flex: 1, minHeight: 240, backgroundColor: colors.map },
  mapControls: { position: 'absolute', top: 12, right: 12, gap: 10 },
  sheet: {
    flexGrow: 0,
    maxHeight: '50%',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  sheetBody: { padding: 16, gap: 12 },
  name: { fontSize: 20, fontWeight: '800', color: colors.ink },
  summary: { fontSize: 24, fontWeight: '800', color: colors.ink },
  body: { fontSize: 15, color: colors.body, lineHeight: 21, flexShrink: 1 },
  note: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  working: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: TOUCH_TARGET },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roughSwatch: { width: 24, height: 0, borderTopWidth: 6, borderStyle: 'dashed', borderColor: colors.orange },
  credit: { fontSize: 12, color: colors.muted },
  driveTop: { position: 'absolute', top: 0, left: 12, right: 12 },
  driveCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  driveCardWarn: { borderColor: colors.orange, borderWidth: 2 },
  driveDistance: { fontSize: 30, fontWeight: '800', color: colors.ink },
  driveInstruction: { fontSize: 19, fontWeight: '700', color: colors.ink, lineHeight: 25 },
  driveWarning: { fontSize: 15, fontWeight: '700', color: colors.orangeDark },
  driveProblem: { fontSize: 14, color: colors.red },
  turns: { gap: 8 },
  turnsToggle: { minHeight: TOUCH_TARGET, justifyContent: 'center' },
  turnsToggleText: { fontSize: 15, fontWeight: '700', color: colors.pine, textDecorationLine: 'underline' },
  turnRows: { gap: 10 },
  turnRow: { flexDirection: 'row', gap: 8 },
  turnNumber: { fontSize: 15, fontWeight: '700', color: colors.ink, minWidth: 24 },
  turnText: { flex: 1, gap: 2 },
  roughNote: { color: colors.orangeDark, fontWeight: '600' },
  pressed: { opacity: 0.75 },
  driveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  driveLeft: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.ink },
});
