// Explore: every spot on a map or in a list, colored by how well it fits your
// rig. Filters, map type and view are remembered between launches.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LegendModal } from '@/components/Legend';
import { SpotMap, type SpotMapHandle } from '@/components/SpotMap';
import { SpotListItem, SpotSummaryCard } from '@/components/SpotSummary';
import { Banner, EmptyState, IconButton, Pills, Segmented } from '@/components/ui';
import { DEFAULT_REGION } from '@/config';
import { cleanupTitle } from '@/components/Cleanups';
import { useCleanups } from '@/data/cleanupsStore';
import { useSpots } from '@/data/spots';
import { useAuth } from '@/lib/auth';
import { regionForCoordinates, type Region } from '@/lib/geo';
import { selectionFeedback } from '@/lib/haptics';
import { useLocation } from '@/lib/location';
import { usePrefs } from '@/lib/prefs';
import { useFitRig, useRig } from '@/lib/rig';
import { rigDisplayName, rigSummary } from '@/lib/rigModel';
import type { SpotFilter } from '@/lib/schemas';
import { applyFilters, buildSpotRows, countLabel, sortRows, type SpotRow } from '@/lib/spotRows';
import { spotsStatus } from '@/lib/spotsStatus';
import { colors, radius, TOUCH_TARGET } from '@/theme';

const FILTER_OPTIONS: readonly { value: SpotFilter; label: string }[] = [
  { value: 'fits', label: 'Fits my rig' },
  { value: 'free', label: 'Free for my rig' },
];

const VIEW_OPTIONS = [
  { value: 'map', label: 'Map', icon: 'map-outline' },
  { value: 'list', label: 'List', icon: 'list-outline' },
] as const;

/** Space between the summary card and the bottom of the map. */
const CARD_MARGIN = 12;
/** Room the count pill needs at the top of the map. */
const COUNT_PILL_ROOM = 52;

function ListSeparator() {
  return <View style={styles.separator} />;
}

export default function ExploreScreen() {
  const spotsState = useSpots();
  const { spots: everySpot, source, refresh, refreshing, remoteEnabled } = spotsState;
  // Your own spots hidden for review stay off the map, like everyone else's.
  const spots = useMemo(() => everySpot.filter((s) => !s.hidden), [everySpot]);
  const { rig } = useRig();
  const fitRig = useFitRig();
  const { prefs, toggleFilter, clearFilters, setView, setMapType } = usePrefs();
  const { coords, status: locationStatus, locating, locate } = useLocation();
  const { status: authStatus } = useAuth();
  const { cleanups } = useCleanups();
  // Cleanups still to do show as orange pins; tapping one opens it.
  const cleanupPins = useMemo(
    () =>
      cleanups
        .filter((t) => t.status === 'open' && !t.hidden)
        .map((t) => ({ id: t.id, latitude: t.latitude, longitude: t.longitude, label: `Cleanup: ${cleanupTitle(t)}` })),
    [cleanups],
  );
  const openCleanup = useCallback((id: string) => router.push({ pathname: '/cleanup/[id]', params: { id } }), []);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [mapHeight, setMapHeight] = useState(0);
  const [controlsBottom, setControlsBottom] = useState(0);
  const [legendOpen, setLegendOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<SpotMapHandle>(null);
  const [startRegion] = useState(() => regionForCoordinates(spots, DEFAULT_REGION));
  // Where the map was when the camper switched to the list, to come back to.
  const [returnRegion, setReturnRegion] = useState<Region | null>(null);
  const initialRegion = returnRegion ?? startRegion;

  const allRows = useMemo(() => buildSpotRows(spots, fitRig, coords), [spots, fitRig, coords]);
  const rows = useMemo(() => sortRows(applyFilters(allRows, prefs.filters)), [allRows, prefs.filters]);
  const selectedRow = selectedId ? (rows.find((r) => r.spot.id === selectedId) ?? null) : null;
  const filtered = prefs.filters.length > 0;
  const status = spotsStatus(spotsState);

  // On small screens (or with large text) the card can reach the map buttons.
  // Hide whatever it would cover; closing the card brings them back.
  const cardTop = selectedRow ? mapHeight - sheetHeight - CARD_MARGIN : Number.POSITIVE_INFINITY;
  const showControls = !selectedRow || sheetHeight === 0 || cardTop >= controlsBottom + 8;
  const showCount = !selectedRow || sheetHeight === 0 || cardTop >= COUNT_PILL_ROOM;

  const openSpot = useCallback((id: string) => router.push({ pathname: '/spot/[id]', params: { id } }), []);

  const onSelect = useCallback((id: string | null) => {
    if (id) selectionFeedback();
    setSelectedId(id);
  }, []);

  // Android's back button closes the card before it leaves the app. A
  // selection whose spot is no longer listed (say, the rig changed while
  // "Fits my rig" was on) is dropped, so it can't swallow a back press or
  // pop up again later.
  const hasCard = selectedRow != null;
  useFocusEffect(
    useCallback(() => {
      if (!hasCard) {
        setSelectedId(null);
        return undefined;
      }
      // Browsers have no back button to catch (the browser preview).
      if (Platform.OS === 'web') return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        setSelectedId(null);
        return true;
      });
      return () => subscription.remove();
    }, [hasCard]),
  );

  const onMapReady = useCallback(() => setMapReady(true), []);

  // Frame the map once, when real data first arrives (saved or server spots,
  // or the camper's location from an earlier visit), unless the camper has
  // already touched the map.
  const mapTouched = useRef(false);
  const framed = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (framed.current || mapTouched.current || !map || !mapReady) return;
    if (coords) {
      framed.current = true;
      map.centerOn(coords);
    } else if (source !== 'seed') {
      framed.current = true;
      map.fitToRows();
    }
  }, [coords, source, mapReady]);

  const onToggleFilter = (filter: SpotFilter) => {
    setSelectedId(null);
    const next = prefs.filters.includes(filter)
      ? prefs.filters.filter((f) => f !== filter)
      : [...prefs.filters, filter];
    toggleFilter(filter);
    // Screen readers hear the new count; sighted campers see the pins change.
    AccessibilityInfo.announceForAccessibility(countLabel(applyFilters(allRows, next).length, next.length > 0));
  };

  // Adding a spot needs an account: sign in first, then straight to the form.
  const onAddSpot = () => {
    if (authStatus === 'signed-in') router.push('/spot/new');
    else router.push({ pathname: '/sign-in', params: { next: '/spot/new' } });
  };

  const onLocate = async () => {
    const found = await locate();
    if (found) mapRef.current?.centerOn(found);
  };

  const empty =
    allRows.length === 0 ? (
      <EmptyState icon="map-outline" title="No spots yet" message="Spots will show up here as campers add them." />
    ) : rows.length === 0 ? (
      <EmptyState
        icon="funnel-outline"
        title="No spots match these filters"
        message="Try clearing a filter or picking a different rig."
        actionLabel="Clear filters"
        onAction={clearFilters}
      />
    ) : null;

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.4}>
            DisCamp
          </Text>
          <View style={styles.headerActions}>
            {authStatus !== 'disabled' && (
              <Pressable
                onPress={onAddSpot}
                accessibilityRole="button"
                accessibilityLabel="Add a spot"
                style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
              >
                <Ionicons name="add" size={20} color="#FFFFFF" />
                <Text style={styles.addText} numberOfLines={1} maxFontSizeMultiplier={1.6}>
                  Add spot
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => setLegendOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="What the colors mean"
              style={styles.headerIcon}
            >
              <Ionicons name="help-circle-outline" size={26} color={colors.pine} />
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={() => router.navigate('/rig')}
          accessibilityRole="button"
          accessibilityLabel={`Showing fit for ${rigDisplayName(rig)}, ${rigSummary(rig)}`}
          accessibilityHint="Opens My Rig"
          style={({ pressed }) => [styles.rigChip, pressed && styles.pressed]}
        >
          <Ionicons name="car-sport-outline" size={22} color={colors.pine} />
          <View style={styles.rigText}>
            <Text style={styles.rigLabel} numberOfLines={1}>
              Showing fit for <Text style={styles.rigName}>{rigDisplayName(rig)}</Text>
            </Text>
            <Text style={styles.rigSummary} numberOfLines={1}>
              {rigSummary(rig)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        <View style={styles.controlsRow}>
          <Pills
            mode="multiple"
            options={FILTER_OPTIONS}
            isSelected={(f) => prefs.filters.includes(f)}
            onPress={onToggleFilter}
            accessibilityLabel="Filters"
          />
          <Segmented
            options={VIEW_OPTIONS}
            value={prefs.view}
            onChange={(view) => {
              setSelectedId(null);
              // The map is rebuilt when it comes back, and has to load again,
              // in the same place.
              if (view !== 'map' && prefs.view === 'map') {
                setReturnRegion(mapRef.current?.currentRegion() ?? null);
                setMapReady(false);
              }
              setView(view);
            }}
            accessibilityLabel="Show spots as"
          />
        </View>
      </SafeAreaView>

      {status && (
        <View style={styles.bannerWrap}>
          <Banner
            tone={status.tone}
            message={status.message}
            actionLabel={status.canRetry ? 'Retry' : undefined}
            onAction={() => void refresh()}
            actionBusy={refreshing}
            announceKey={spotsState.error ?? undefined}
          />
        </View>
      )}

      {prefs.view === 'map' ? (
        <View
          style={styles.mapWrap}
          testID="map-area"
          onLayout={(e) => setMapHeight(e.nativeEvent.layout.height)}
          onTouchStart={() => {
            mapTouched.current = true;
          }}
        >
          <SpotMap
            ref={mapRef}
            rows={rows}
            selectedId={selectedId}
            onSelect={onSelect}
            mapType={prefs.mapType}
            showsUserLocation={locationStatus === 'granted'}
            initialRegion={initialRegion}
            bottomInset={selectedRow && sheetHeight > 0 ? sheetHeight + CARD_MARGIN : 0}
            onMapReady={onMapReady}
            cleanups={cleanupPins}
            onOpenCleanup={openCleanup}
          />

          {showCount && (
            <View style={styles.countPill}>
              <Text style={styles.countText}>{countLabel(rows.length, filtered)}</Text>
            </View>
          )}

          {showControls && (
            <View
              style={styles.mapControls}
              testID="map-controls"
              onLayout={(e) => setControlsBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
            >
              <IconButton
                icon="layers-outline"
                label={prefs.mapType === 'hybrid' ? 'Show standard map' : 'Show satellite map'}
                active={prefs.mapType === 'hybrid'}
                onPress={() => setMapType(prefs.mapType === 'hybrid' ? 'standard' : 'hybrid')}
              />
              <IconButton icon="scan-outline" label="Show all spots" onPress={() => mapRef.current?.fitToRows()} />
              <IconButton icon="locate" label="Show my location" busy={locating} onPress={() => void onLocate()} />
            </View>
          )}

          {empty && <View style={styles.emptyWrap}>{empty}</View>}

          {selectedRow && (
            <SpotSummaryCard
              row={selectedRow}
              onOpen={() => openSpot(selectedRow.spot.id)}
              onClose={() => setSelectedId(null)}
              onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
            />
          )}
        </View>
      ) : (
        <FlatList<SpotRow>
          data={rows}
          keyExtractor={(row) => row.spot.id}
          renderItem={({ item }) => <SpotListItem row={item} onPress={() => openSpot(item.spot.id)} />}
          ItemSeparatorComponent={ListSeparator}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            rows.length > 0 ? (
              <View style={styles.listHeader}>
                <Text style={styles.listCount}>
                  {countLabel(rows.length, filtered)} · best fit {coords ? 'and nearest ' : ''}first
                </Text>
                {!coords && (
                  <Pressable
                    onPress={() => void locate()}
                    disabled={locating}
                    accessibilityRole="button"
                    accessibilityState={{ busy: locating, disabled: locating }}
                    hitSlop={8}
                    style={styles.linkButton}
                  >
                    <Text style={[styles.linkText, locating && styles.linkBusy]}>
                      {locating ? 'Finding you…' : 'Sort by distance'}
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : null
          }
          ListEmptyComponent={empty}
          refreshControl={
            remoteEnabled ? (
              <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.pine} />
            ) : undefined
          }
        />
      )}

      <LegendModal visible={legendOpen} onClose={() => setLegendOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  title: { flexShrink: 1, fontSize: 28, fontWeight: '800', color: colors.ink, letterSpacing: 0.3 },
  headerIcon: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.pine,
  },
  addText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  rigChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  rigText: { flex: 1 },
  rigLabel: { fontSize: 15, color: colors.body },
  rigName: { fontWeight: '700', color: colors.ink },
  rigSummary: { fontSize: 13, color: colors.muted },
  controlsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  bannerWrap: { paddingHorizontal: 12, paddingTop: 10 },
  mapWrap: { flex: 1, backgroundColor: colors.map },
  countPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
  },
  countText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  mapControls: { position: 'absolute', top: 12, right: 12, gap: 10 },
  emptyWrap: { position: 'absolute', left: 16, right: 76, top: 64 },
  listContent: { padding: 12, paddingBottom: 32, flexGrow: 1 },
  listHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  listCount: { fontSize: 14, color: colors.body, flexShrink: 1 },
  linkButton: { minHeight: TOUCH_TARGET, justifyContent: 'center' },
  linkText: { fontSize: 14, fontWeight: '700', color: colors.pine, textDecorationLine: 'underline' },
  linkBusy: { color: colors.muted, textDecorationLine: 'none' },
  separator: { height: 10 },
  pressed: { opacity: 0.75 },
});
