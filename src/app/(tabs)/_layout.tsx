// Bottom tabs: Explore, Cleanups, My Rig and Account. The selected tab is
// green, with a filled icon, a bold label and a line under it; the others are
// gray outlines. (Not by color alone: the fill, weight and line show it too.)

import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View, type ColorValue } from 'react-native';

import { colors } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** The tab's icon: filled when selected, an outline when not. */
function tabIcon(selected: IconName, other: IconName) {
  return function TabIcon({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) {
    return <Ionicons name={focused ? selected : other} color={color as string} size={size} />;
  };
}

/** The tab's name, bold with a line under it when selected. */
function TabLabel({ focused, color, children }: { focused: boolean; color: ColorValue; children: string }) {
  return (
    <View style={styles.label}>
      <Text style={[styles.text, { color }, focused && styles.textOn]} numberOfLines={1}>
        {children}
      </Text>
      {/* Always there, so the label doesn't jump; only colored when selected. */}
      <View style={[styles.line, focused && { backgroundColor: color }]} testID={`tab-line-${children}`} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tabOn,
        tabBarInactiveTintColor: colors.tabOff,
        tabBarLabel: TabLabel,
        headerTintColor: colors.ink,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Explore', headerShown: false, tabBarIcon: tabIcon('map', 'map-outline') }}
      />
      <Tabs.Screen name="cleanups" options={{ title: 'Cleanups', tabBarIcon: tabIcon('leaf', 'leaf-outline') }} />
      <Tabs.Screen name="rig" options={{ title: 'My Rig', tabBarIcon: tabIcon('car-sport', 'car-sport-outline') }} />
      <Tabs.Screen
        name="account"
        options={{ title: 'Account', tabBarIcon: tabIcon('person-circle', 'person-circle-outline') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: { alignItems: 'center', gap: 2 },
  text: { fontSize: 10, fontWeight: '500' },
  textOn: { fontWeight: '800' },
  line: { width: 24, height: 3, borderRadius: 2, backgroundColor: 'transparent' },
});
