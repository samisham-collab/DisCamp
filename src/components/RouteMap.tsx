// The route preview's map: Apple Maps on iPhone, Google Maps on Android, with
// DisCamp's route drawn on top. Blue is the route; orange marks stretches the
// map data calls unpaved or rough.

import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { colors } from '../theme';
import type { RouteMapProps } from './RouteMap.types';

export type { RouteMapProps } from './RouteMap.types';

const START_DELTA = 0.4;
const EDGE_PADDING = { top: 64, right: 48, bottom: 48, left: 48 };
const CASING = '#FFFFFF';

export function RouteMap({ path, roughSegments, destination, satellite }: RouteMapProps) {
  const mapRef = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [initialRegion] = useState(() => ({
    latitude: destination.latitude,
    longitude: destination.longitude,
    latitudeDelta: START_DELTA,
    longitudeDelta: START_DELTA,
  }));

  // Frame the whole route once both the map and the route are ready.
  useEffect(() => {
    if (!ready || path.length < 2) return;
    mapRef.current?.fitToCoordinates(path, { edgePadding: EDGE_PADDING, animated: true });
  }, [ready, path]);

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
            <Polyline
              key={i}
              coordinates={segment}
              strokeColor={colors.orange}
              strokeWidth={5}
              lineCap="round"
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
