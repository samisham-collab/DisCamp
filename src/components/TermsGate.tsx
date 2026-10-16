// Shown before a camper's first spot (and again whenever the terms change):
// the community rules in short, links to the full terms and privacy policy,
// and "I agree". App Review asks for terms that say there's no tolerance for
// objectionable content or abusive users, agreed to before posting.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LEGAL_URLS, MINIMUM_AGE } from '../config';
import { useAuth } from '../lib/auth';
import { colors } from '../theme';
import { LinkRow } from './HelpCard';
import { Banner, Button, Card } from './ui';

export const COMMUNITY_RULES: readonly string[] = [
  'Share real places where camping is allowed. No private land without permission, and no closed areas.',
  'Be accurate. No fake spots, spam or advertising.',
  'Nothing offensive: no hate, harassment, threats, sexual content or other people’s private information, in spots, photos, notes or names. Leave faces and license plates out of photos.',
  'DisCamp has zero tolerance for objectionable content and abusive campers. We remove it and ban accounts that post it.',
  'Spots, photos and notes you add are public, so other campers can use and improve them.',
  `You're ${MINIMUM_AGE} or older.`,
];

/** Null when the camper has agreed: render the screen itself. */
export function TermsGate() {
  const { termsAccepted, acceptTerms } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (termsAccepted === true) return null;
  if (termsAccepted === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.pine} accessibilityLabel="Loading your account" />
      </View>
    );
  }

  const agree = async () => {
    setSaving(true);
    setError(null);
    const result = await acceptTerms();
    setSaving(false);
    if (result.ok) AccessibilityInfo.announceForAccessibility('Thanks. You can add spots now.');
    else setError(result.message);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.intro}>
        <Ionicons
          accessibilityElementsHidden
          importantForAccessibility="no"
          name="shield-checkmark-outline"
          size={48}
          color={colors.pine}
        />
        <Text style={styles.title} accessibilityRole="header">
          Before you post
        </Text>
        <Text style={styles.body}>
          DisCamp works because campers look out for each other. Please agree to these rules.
        </Text>
      </View>

      <Card>
        {COMMUNITY_RULES.map((rule, i) => (
          <View key={rule} style={styles.rule}>
            <Text style={styles.number}>{i + 1}.</Text>
            <Text style={styles.ruleText}>{rule}</Text>
          </View>
        ))}
        <LinkRow label="Read the full terms of use" url={LEGAL_URLS.terms} />
        <LinkRow label="Read the privacy policy" url={LEGAL_URLS.privacy} />
      </Card>

      {error ? <Banner tone="error" message={error} announceKey={error} /> : null}

      <Button label="I agree" icon="checkmark" loading={saving} onPress={() => void agree()} />
      <Button
        label="Not now"
        kind="secondary"
        disabled={saving}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: colors.bg },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  intro: { alignItems: 'center', gap: 8, paddingTop: 8 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  body: { fontSize: 15, color: colors.body, lineHeight: 21, textAlign: 'center' },
  rule: { flexDirection: 'row', gap: 8 },
  number: { fontSize: 15, fontWeight: '700', color: colors.pine, minWidth: 18 },
  ruleText: { flex: 1, fontSize: 15, color: colors.body, lineHeight: 21 },
});
