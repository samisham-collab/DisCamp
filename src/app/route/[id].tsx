// Route preview: the drive from the camper to a spot, drawn on DisCamp's map
// (Apple Maps or Google Maps underneath) and worked out for their rig. The
// turn-by-turn drive itself opens in the phone's maps app.

import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RouteMap } from '@/components/RouteMap';
import { Banner, Button, EmptyState, IconButton } from '@/components/ui';
import { useSpot } from '@/data/spots';
import { openDirections } from '@/lib/links';
import { useLocation } from '@/lib/location';
import { usePrefs } from '@/lib/prefs';
import { useFitRig, useRig } from '@/lib/rig';
import { rigDisplayName } from '@/lib/rigModel';
import {
  costingFor,
  fetchRoute,
  ROUTE_ERROR_MESSAGES,
  RouteError,
  routeSummary,
  type RouteErrorKind,
  type RoutePlan,
} from '@/lib/routing';
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

export default function RoutePreviewScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { spot, loading } = useSpot(id);
  const fitRig = useFitRig();
  const { rig } = useRig();
  const { locate } = useLocation();
  const { prefs } = usePrefs();
  const [satellite, setSatellite] = useState(prefs.mapType === 'hybrid');
  const [state, setState] = useState<RouteState>({ phase: 'locating' });

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
      return;
    }
    setState({ phase: 'routing' });
    try {
      const plan = await fetchRoute(here, spot, fitRig);
      if (current()) setState({ phase: 'ready', plan });
    } catch (error) {
      if (current()) setState({ phase: 'error', kind: error instanceof RouteError ? error.kind : 'unavailable' });
    }
  }, [spot, fitRig, locate]);

  // Once, when the spot is known (not again when the spot list refreshes).
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!spot || startedFor.current === spot.id) return;
    startedFor.current = spot.id;
    void start();
  }, [spot, start]);

  if (!spot) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: loading ? 'Loading' : 'Not found' }} />
        {loading ? (
          <ActivityIndicator size="large" color={colors.pine} />
        ) : (
          <EmptyState
            icon="compass-outline"
            title="Spot not found"
            message="It may have been removed, or the link is wrong."
            actionLabel="Back to the map"
            onAction={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        )}
      </View>
    );
  }

  const plan = state.phase === 'ready' ? state.plan : null;
  const directionsButton = (kind: 'primary' | 'secondary') => (
    <Button
      label={state.phase === 'ready' ? `Start in ${MAPS_APP}` : `Directions in ${MAPS_APP}`}
      icon="navigate-outline"
      kind={kind}
      onPress={() => void openDirections(spot)}
    />
  );

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Route preview' }} />
      <View style={styles.mapWrap}>
        <RouteMap
          path={plan?.path ?? []}
          roughSegments={plan?.roughSegments ?? []}
          destination={{ latitude: spot.latitude, longitude: spot.longitude, name: spot.name }}
          satellite={satellite}
        />
        <View style={styles.mapControls}>
          <IconButton
            icon="layers-outline"
            label={satellite ? 'Show standard map' : 'Show satellite map'}
            active={satellite}
            onPress={() => setSatellite((s) => !s)}
          />
        </View>
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetBody}>
        <Text style={styles.name} accessibilityRole="header" numberOfLines={2}>
          {spot.name}
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
                <Text style={styles.body}>About {miles(plan.roughMiles)} mi unpaved or rough (orange on the map)</Text>
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
            <Banner
              tone="info"
              message="Back roads can be missing or wrong on the map, and drive times there run long. Check the spot's directions and recent check-ins before you go."
            />
            {directionsButton('primary')}
          </>
        ) : null}

        {state.phase === 'no-location' ? (
          <>
            <Text style={styles.body}>DisCamp needs your location to work out a route.</Text>
            <Button label="Try again" icon="refresh" kind="secondary" onPress={() => void start()} />
            {directionsButton('primary')}
          </>
        ) : null}

        {state.phase === 'error' ? (
          <>
            <Text style={styles.body}>{ROUTE_ERROR_MESSAGES[state.kind]}</Text>
            {state.kind !== 'off' ? (
              <Button label="Try again" icon="refresh" kind="secondary" onPress={() => void start()} />
            ) : null}
            {directionsButton('primary')}
          </>
        ) : null}

        <Text style={styles.credit}>Route by Valhalla · Road data © OpenStreetMap contributors</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
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
  working: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: TOUCH_TARGET },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roughSwatch: { width: 24, height: 6, borderRadius: 3, backgroundColor: colors.orange },
  credit: { fontSize: 12, color: colors.muted },
});
