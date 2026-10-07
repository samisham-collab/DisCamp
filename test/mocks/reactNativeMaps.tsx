// Test stand-in for react-native-maps: plain views, with the map methods the
// app calls exposed as jest mocks.

import { jest } from '@jest/globals';
import { forwardRef, useEffect, useImperativeHandle, type ReactNode, type Ref } from 'react';
import { Pressable, View } from 'react-native';

export const mapMethods = {
  animateToRegion: jest.fn(),
  animateCamera: jest.fn(),
  fitToCoordinates: jest.fn(),
};

export const markerMethods = {
  redraw: jest.fn(),
};

// Maps report ready right after they appear. A test can hold that back to
// check what happens while the map is still loading, then release it.
let mapReadyHeld = false;
let heldReady: (() => void) | undefined;
export function holdMapReady(): void {
  mapReadyHeld = true;
}
export function releaseMapReady(): void {
  mapReadyHeld = false;
  const ready = heldReady;
  heldReady = undefined;
  ready?.();
}

type MapPress = { nativeEvent: { action?: string } };

interface MapProps {
  children?: ReactNode;
  testID?: string;
  onPress?: (e: MapPress) => void;
  onMapReady?: () => void;
}

// Tests tap the map with fireEvent(map, 'touchEnd', { nativeEvent: { action } }).
const MapView = forwardRef<typeof mapMethods, MapProps>(function MapView(
  { children, testID, onPress, onMapReady },
  ref,
) {
  useImperativeHandle(ref, () => mapMethods);
  // Like the real map, report ready once, right after it appears.
  useEffect(() => {
    if (mapReadyHeld) heldReady = onMapReady;
    else onMapReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, like the native event
  }, []);
  return (
    <View
      testID={testID}
      onTouchEnd={(e) => {
        const { action } = (e as unknown as Partial<MapPress>).nativeEvent ?? {};
        onPress?.({ nativeEvent: { action } });
      }}
    >
      {children}
    </View>
  );
});

export function Marker({
  ref,
  children,
  testID,
  accessibilityLabel,
  onPress,
}: {
  ref?: Ref<typeof markerMethods>;
  children?: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
  onPress?: () => void;
}) {
  useImperativeHandle(ref, () => markerMethods);
  return (
    <Pressable testID={testID} accessibilityLabel={accessibilityLabel} onPress={onPress}>
      {children}
    </Pressable>
  );
}

export default MapView;
