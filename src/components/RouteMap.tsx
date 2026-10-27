// The route preview's map: Apple Maps on iPhone, Google Maps on Android, with
// DisCamp's route drawn on top. Blue is the route; orange marks stretches the
// map data calls unpaved or rough.

import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { useReducedMotion } from '../lib/accessibility';
import { colors } from '../theme';
import type { RouteMapProps } from './RouteMap.types';

export type { RouteMapProps } from './RouteMap.types';

const START_DELTA = 0.4;
const EDGE_PADDING = { top: 64, right: 48, bottom: 48, left: 48 };
const CASING = '#FFFFFF';
/** Rough stretches: orange dashes over the blue line. */
const ROUGH_DASHES = [10, 8];
/** Drive mode's camera: Google Maps uses zoom, Apple Maps uses altitude (meters). */
const FOLLOW_ZOOM = 17;
const FOLLOW_ALTITUDE = 700;

export function RouteMap({ path, roughSegments, destination, satellite, follow, onUserPan }: RouteMapProps) {
  const mapRef = useRef<MapView>(null);
  const reducedMotion = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [initialRegion] = useState(() => ({
    latitude: destination.latitude,
    longitude: destination.longitude,
    latitudeDelta: START_DELTA,
    longitudeDelta: START_DELTA,
  }));

  const following = follow != null;
  // Frame the whole route once both the map and the route are ready (not while driving).
  useEffect(() => {
    if (!ready || path.length < 2 || following) return;
    mapRef.current?.fitToCoordinates(path, { edgePadding: EDGE_PADDING, animated: !reducedMotion });
  }, [ready, path, following, reducedMotion]);

  // Drive mode: the camera rides along, tilted, facing the way the camper
  // drives. With Reduce Motion on, it stays north-up and flat, and jumps
  // instead of gliding.
  const followLat = follow?.center.latitude;
  const followLng = follow?.center.longitude;
  const followHeading = follow?.heading;
  useEffect(() => {
    if (!ready || followLat == null || followLng == null) return;
    mapRef.current?.animateCamera(
      {
        center: { latitude: followLat, longitude: followLng },
        heading: reducedMotion ? 0 : (followHeading ?? 0),
        pitch: reducedMotion ? 0 : 40,
        zoom: FOLLOW_ZOOM,
        altitude: FOLLOW_ALTITUDE,
      },
      { duration: reducedMotion ? 0 : 800 },
    );
  }, [ready, followLat, followLng, followHeading, reducedMotion]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
      mapType={satellite ? 'hybrid' : 'standard'}
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
      onMapReady={() => setReady(true)}
      onPanDrag={onUserPan}
      testID="route-map"
    >
      {path.length >= 2 ? (
        <>
          <Polyline
            coordinates={path}
            strokeColor={CASING}
            strokeWidth={9}
            lineCap="round"
            lineJoin="round"
            zIndex={1}
          />
          <Polyline
            coordinates={path}
            strokeColor={colors.you}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
            zIndex={2}
            testID="route-line"
          />
          {roughSegments.map((segment, i) => (
            // Dashed, not just orange, so rough stretches don't depend on telling colors apart.
            <Polyline
              key={i}
              coordinates={segment}
              strokeColor={colors.orange}
              strokeWidth={6}
              lineDashPattern={ROUGH_DASHES}
              lineCap="butt"
              lineJoin="round"
              zIndex={3}
              testID="route-rough"
            />
          ))}
        </>
      ) : null}
      <Marker
        coordinate={{ latitude: destination.latitude, longitude: destination.longitude }}
        pinColor={colors.pine}
        title={destination.name}
        accessibilityLabel={`${destination.name}, where the route ends`}
        testID="route-destination"
      />
    </MapView>
  );
}
