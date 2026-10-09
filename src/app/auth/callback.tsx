// Where the sign-in redirect lands if it ever reaches a screen. On phones the
// sign-in sheet (and +native-intent.tsx) normally catch it first; in a web
// browser this page runs inside the sign-in popup and hands the result back.

import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { completeSignInFromUrl } from '@/lib/authFlows';
import { getSupabase } from '@/lib/supabase';
import { colors } from '@/theme';

export default function AuthCallbackScreen() {
  const {
    code,
    error,
    error_description: description,
  } = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
  }>();
  // Web: if this page is the sign-in popup, pass the link back to the window
  // that opened it, which finishes signing in.
  const [popup] = useState(() => WebBrowser.maybeCompleteAuthSession());

  useEffect(() => {
    if (popup.type === 'success') return undefined;
    let active = true;
    void (async () => {
      const client = getSupabase();
      if (client) {
        const query = Object.entries({ code, error, error_description: description })
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '')
          .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
          .join('&');
        await completeSignInFromUrl(client, `/auth/callback?${query}`);
      }
      // Account shows whether it worked.
      if (active) router.replace('/account');
    })();
    return () => {
      active = false;
    };
  }, [code, error, description, popup]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator color={colors.pine} size="large" />
      <Text style={styles.text}>Finishing sign-in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.bg },
  text: { fontSize: 16, color: colors.body },
});
