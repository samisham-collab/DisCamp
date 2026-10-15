// The map: Apple Maps on iPhone, Google Maps on Android (react-native-maps).
// Only this file talks to the map library, so swapping to MapLibre for
// offline maps later means changing one file.

import { memo, useCallback, useEffect, useImperativeHandle, useRef, useState, type ComponentRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, type MapPressEvent, type Region as MapRegion } from 'react-native-maps';

import { MIN_DELTA, regionForCoordinates, type Region } from '../lib/geo';
import type { SpotRow } from '../lib/spotRows';
import { colors } from '../theme';
import { SpotPin } from './Fit';
import type { SpotMapProps } from './SpotMap.types';

export type { CleanupPin, SpotMapHandle, SpotMapProps } from './SpotMap.types';

/** How long a custom marker keeps re-drawing after its look changes. */
const MARKER_REDRAW_MS = 500;
/** A first, quick re-draw so a new pin color shows almost at once. */
const MARKER_QUICK_REDRAW_MS = 100;
/** Ignore a map tap this soon after a marker tap (some platforms send both). */
const MARKER_TAP_GRACE_MS = 350;
const CAMERA_MS = 300;
/**
 * Start centering a moment after the card appears. On Android, the new map
 * padding re-positions the camera, which would cancel an animation that
 * started at the same time.
 */
const CENTER_DELAY_MS = 150;

const SpotMarker = memo(function SpotMarker({
  row,
  selected,
  onPress,
}: {
  row: SpotRow;
  selected: boolean;
  onPress: (id: string) => void;
}) {
  const markerRef = useRef<ComponentRef<typeof Marker>>(null);
  // Google Maps (Android) draws custom pins from a snapshot of the view. A
  // change of color alone doesn't trigger a new snapshot, so ask for one
  // (redraw) once the new look is on screen, and track view changes briefly.
  // Apple Maps shows the view itself; the extra redraw is harmless there.
  const look = `${row.fit.status}:${selected ? 1 : 0}`;
  const [settledLook, setSettledLook] = useState<string | null>(null);
  useEffect(() => {
    const quick = setTimeout(() => markerRef.current?.redraw(), MARKER_QUICK_REDRAW_MS);
    const settle = setTimeout(() => {
      markerRef.current?.redraw();
      setSettledLook(look);
    }, MARKER_REDRAW_MS);
    return () => {
      clearTimeout(quick);
      clearTimeout(settle);
    };
  }, [look]);

  return (
    <Marker
      ref={markerRef}
      coordinate={{ latitude: row.spot.latitude, longitude: row.spot.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={settledLook !== look}
      zIndex={selected ? 2 : 1}
      onPress={() => onPress(row.spot.id)}
      accessibilityLabel={`${row.spot.name}: ${row.fit.headline}`}
      testID={`marker-${row.spot.id}`}
    >
      <SpotPin status={row.fit.status} selected={selected} />
    </Marker>
  );
});

export function SpotMap({
  ref,
  rows,
  selectedId,
  onSelect,
  mapType,
  showsUserLocation,
  initialRegion,
  bottomInset,
  onMapReady,
  cleanups,
  onOpenCleanup,
}: SpotMapProps) {
  const mapRef = useRef<MapView>(null);
  const lastMarkerTap = useRef(0);
  const region = useRef<Region | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      fitToRows: () => {
        const coords = rows.map((r) => ({ latitude: r.spot.latitude, longitude: r.spot.longitude }));
        if (coords.length === 0) return;
        // One spot, or several at almost the same place: fitting to them
        // would zoom all the way in, so show the area around them instead.
        const around = regionForCoordinates(coords, initialRegion);
        if (coords.length === 1 || (around.latitudeDelta <= MIN_DELTA && around.longitudeDelta <= MIN_DELTA)) {
          mapRef.current?.animateToRegion(around, 400);
          return;
        }
        mapRef.current?.fitToCoordinates(coords, {
          edgePadding: { top: 80, right: 72, bottom: bottomInset + 72, left: 72 },
          animated: true,
        });
      },
      centerOn: (at) => {
        mapRef.current?.animateToRegion({ ...at, latitudeDelta: 0.3, longitudeDelta: 0.3 }, 400);
      },
      currentRegion: () => region.current,
    }),
    [rows, initialRegion, bottomInset],
  );

  // Once the summary card is up (bottomInset > 0), glide the selected pin to
  // the middle of the map area that's still visible above the card.
  const selected = selectedId ? rows.find((r) => r.spot.id === selectedId) : undefined;
  const selectedLatitude = selected?.spot.latitude;
  const selectedLongitude = selected?.spot.longitude;
  useEffect(() => {
    if (selectedLatitude == null || selectedLongitude == null || bottomInset <= 0) return undefined;
    const timer = setTimeout(() => {
      mapRef.current?.animateCamera(
        { center: { latitude: selectedLatitude, longitude: selectedLongitude } },
        { duration: CAMERA_MS },
      );
    }, CENTER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [selectedId, selectedLatitude, selectedLongitude, bottomInset]);

  const onMarkerPress = useCallback(
    (id: string) => {
      lastMarkerTap.current = Date.now();
      onSelect(id);
    },
    [onSelect],
  );

  const onMapPress = useCallback(
    (e: MapPressEvent) => {
      if (e.nativeEvent.action === 'marker-press') return;
      if (Date.now() - lastMarkerTap.current < MARKER_TAP_GRACE_MS) return;
      onSelect(null);
    },
    [onSelect],
  );

  // Keeps the map's legal notices (and the Google logo) clear of the card.
  const padding = { top: 0, right: 0, bottom: bottomInset, left: 0 };

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
      mapType={mapType}
      showsUserLocation={showsUserLocation}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      // Android otherwise starts its own camera move on every pin tap, which
      // fights the centering above.
      moveOnMarkerPress={false}
      mapPadding={padding}
      legalLabelInsets={padding}
      onPress={onMapPress}
      onMapReady={onMapReady}
      onRegionChangeComplete={(next: MapRegion) => {
        region.current = next;
      }}
      testID="spot-map"
    >
      {rows.map((row) => (
        <SpotMarker key={row.spot.id} row={row} selected={row.spot.id === selectedId} onPress={onMarkerPress} />
      ))}
      {/* Cleanups: the map's own pins (no custom view, so nothing to redraw). */}
      {(cleanups ?? []).map((pin) => (
        <Marker
          key={`cleanup-${pin.id}`}
          coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
          pinColor={colors.orange}
          zIndex={0}
          onPress={() => {
            lastMarkerTap.current = Date.now();
            onOpenCleanup?.(pin.id);
          }}
          accessibilityLabel={pin.label}
          testID={`cleanup-marker-${pin.id}`}
        />
      ))}
    </MapView>
  );
}
