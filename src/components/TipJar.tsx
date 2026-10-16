// On Account: "Support DisCamp", the tip jar. Each tip is an in-app purchase
// through the App Store or Google Play; DisCamp never sees card details and
// keeps no record of who tipped. A tip unlocks nothing (src/lib/tips.ts).
// The store connection lives in src/data/tipsStore.tsx.

import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { useTips } from '@/data/tipsStore';
import { colors } from '@/theme';
import { Banner, Button, Card, SectionTitle } from './ui';

const WHY =
  'DisCamp is free, with no ads, and never sells your data. Tips pay for the server and maps and keep it that way. A tip doesn’t unlock anything: it just says thanks.';

const ICONS = { tip_small: 'cafe-outline', tip_medium: 'flame-outline', tip_large: 'car-outline' } as const;
const iconFor = (id: string) => ICONS[id as keyof typeof ICONS] ?? 'heart-outline';

export function TipJar() {
  const { phase, products, buying, thanks, notice, tip, retry } = useTips();

  return (
    <Card>
      <SectionTitle>Support DisCamp</SectionTitle>
      <Text style={styles.body}>{WHY}</Text>
      {phase === 'off' ? (
        <Text style={styles.muted}>Tips work in the App Store and Google Play versions of DisCamp.</Text>
      ) : phase === 'loading' ? (
        <ActivityIndicator color={colors.pine} accessibilityLabel="Loading tips" />
      ) : phase === 'error' ? (
        <>
          <Text style={styles.muted}>The tip jar can&apos;t reach the store right now.</Text>
          <Button label="Try again" icon="refresh" kind="secondary" onPress={retry} />
        </>
      ) : (
        <>
          {thanks ? (
            <Banner tone="info" icon="heart" message="Thank you! Your tip keeps DisCamp free for every camper." />
          ) : null}
          {notice ? <Banner tone="warning" message={notice} /> : null}
          {products.map((p) => (
            <Button
              key={p.id}
              label={`${p.label} · ${p.price}`}
              icon={iconFor(p.id)}
              kind="secondary"
              loading={buying === p.id}
              disabled={buying != null && buying !== p.id}
              accessibilityHint="Opens the store to leave a tip"
              onPress={() => tip(p.id)}
            />
          ))}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 15, color: colors.body, lineHeight: 21 },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
});
