// Help and legal: how to reach DisCamp, the privacy policy and the terms of
// use. App Review looks for a way to contact you inside the app.

import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';

import { LEGAL_URLS, SUPPORT_EMAIL } from '../config';
import { copyText, openEmail, openWebLink } from '../lib/links';
import { colors, TOUCH_TARGET } from '../theme';
import { ActionButton, Card, SectionTitle } from './ui';

export function LinkRow({ label, url, hint }: { label: string; url: string; hint?: string }) {
  return (
    <Pressable
      onPress={() => void openWebLink(url)}
      accessibilityRole="link"
      accessibilityHint={hint ?? 'Opens in your browser'}
      style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
    >
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

export function HelpCard() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    if (SUPPORT_EMAIL && (await copyText(SUPPORT_EMAIL, 'email address'))) {
      setCopied(true);
      AccessibilityInfo.announceForAccessibility('Email address copied');
    }
  };

  return (
    <Card>
      <SectionTitle>Help and contact</SectionTitle>
      <Text style={styles.body}>
        Questions, a problem with a spot or another camper, or anything else: we read every message and answer reports
        within 24 hours.
      </Text>
      {SUPPORT_EMAIL ? (
        <>
          <Text style={styles.email} selectable accessibilityLabel={`Support email: ${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </Text>
          <View style={styles.actions}>
            <ActionButton
              icon="mail-outline"
              label="Email us"
              onPress={() => void openEmail(SUPPORT_EMAIL ?? '', 'DisCamp')}
            />
            <ActionButton
              icon={copied ? 'checkmark' : 'copy-outline'}
              label={copied ? 'Copied' : 'Copy address'}
              onPress={() => void copy()}
            />
          </View>
        </>
      ) : null}
      <LinkRow label="Support page" url={LEGAL_URLS.support} />
      <LinkRow label="Privacy policy" url={LEGAL_URLS.privacy} />
      <LinkRow label="Terms of use" url={LEGAL_URLS.terms} />
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 15, color: colors.body, lineHeight: 21 },
  email: { fontSize: 16, fontWeight: '700', color: colors.ink },
  actions: { flexDirection: 'row', gap: 8 },
  linkRow: { minHeight: TOUCH_TARGET, justifyContent: 'center' },
  link: { fontSize: 15, color: colors.pine, textDecorationLine: 'underline' },
  pressed: { opacity: 0.6 },
});
