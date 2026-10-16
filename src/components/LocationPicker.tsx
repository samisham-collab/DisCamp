// Full-screen map for dropping a spot's pin: drag the map until the pin sits
// on the spot, then "Use this location". Satellite view by default, since
// pull-offs and clearings are easier to see from above.

import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DEFAULT_REGION } from '../config';
import { formatCoordinates } from '../lib/geo';
import type { Coordinates } from '../types';
import { colors, TOUCH_TARGET } from '../theme';
import type { LocationPickerProps } from './LocationPicker.types';
import { Button, IconButton } from './ui';

export type { LocationPickerProps } from './LocationPicker.types';

/** The browser preview can't show this map; see LocationPicker.web.tsx. */
export const LOCATION_PICKER_AVAILABLE = true;

/** Close enough to see a pull-off from above. */
const ZOOMED_DELTA = 0.01;

function startRegion(start: Coordinates | null): Region {
  return start ? { ...start, latitudeDelta: ZOOMED_DELTA, longitudeDelta: ZOOMED_DELTA } : DEFAULT_REGION;
}

export function LocationPicker({ visible, start, onCancel, onPick }: LocationPickerProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      {/* Mounted fresh each time it opens, so it starts from the latest pin. */}
      {visible ? <PickerBody start={start} onCancel={onCancel} onPick={onPick} /> : null}
    </Modal>
  );
}

function PickerBody({ start, onCancel, onPick }: Omit<LocationPickerProps, 'visible'>) {
  const [initialRegion] = useState(() => startRegion(start));
  const [center, setCenter] = useState<Coordinates>(() => ({
    latitude: initialRegion.latitude,
    longitude: initialRegion.longitude,
  }));
  const [satellite, setSatellite] = useState(true);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Drop the pin
        </Text>
        <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={8} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
      <Text style={styles.help}>Drag the map until the pin sits where you camp.</Text>

      <View style={styles.mapWrap}>
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          mapType={satellite ? 'hybrid' : 'standard'}
          showsUserLocation
          showsMyLocationButton={false}
          toolbarEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          onRegionChangeComplete={(region: Region) =>
            setCenter({ latitude: region.latitude, longitude: region.longitude })
          }
          testID="location-picker-map"
        />
        {/* The pin stays in the middle; its point marks the spot. */}
        <View pointerEvents="none" style={styles.pinWrap}>
          <Ionicons
            accessibilityElementsHidden
            importantForAccessibility="no"
            name="location"
            size={44}
            color={colors.red}
            style={styles.pin}
          />
        </View>
        <View style={styles.mapControls}>
          <IconButton
            icon="layers-outline"
            label={satellite ? 'Show standard map' : 'Show satellite map'}
            active={satellite}
            onPress={() => setSatellite((s) => !s)}
          />
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.coords} accessibilityLabel={`Pin at ${formatCoordinates(center)}`}>
          {formatCoordinates(center)}
        </Text>
        <Button label="Use this location" icon="checkmark" onPress={() => onPick(center)} />
      </View>
    </SafeAreaView>
  );
}

const PIN = 44;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.card },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink },
  cancel: { minHeight: TOUCH_TARGET, justifyContent: 'center' },
  cancelText: { fontSize: 16, fontWeight: '700', color: colors.pine },
  help: { fontSize: 14, color: colors.body, paddingHorizontal: 16, paddingBottom: 8 },
  mapWrap: { flex: 1, backgroundColor: colors.map },
  pinWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Lift the icon so its point, not its middle, is on the center of the map.
  pin: { marginBottom: PIN },
  mapControls: { position: 'absolute', top: 12, right: 12 },
  footer: { padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: colors.line },
  coords: { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'center' },
});
