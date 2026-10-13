// Test stand-in for expo-image: a plain view that keeps the label and source.

import { View, type ViewProps } from 'react-native';

export function Image({ source, ...props }: ViewProps & { source?: unknown; contentFit?: string }) {
  return <View {...props} {...({ source } as object)} />;
}
