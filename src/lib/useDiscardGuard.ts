// Asks before leaving a screen with work that hasn't been sent (back button,
// swipe, Close or Cancel), so a stray swipe never throws away photos or a
// half-written report.

import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { Alert } from 'react-native';

export function useDiscardGuard(active: boolean, title: string, message: string): void {
  const navigation = useNavigation();
  usePreventRemove(active, ({ data }) => {
    Alert.alert(title, message, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
}
