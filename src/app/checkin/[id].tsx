// Report a change at a spot: a washout, a locked gate, trash, a closure. It
// shows on the spot (and on the map's card) until a camper says "Still good".
// It also takes back this camper's own "Still good" on the spot.

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AccountGate } from '@/components/AccountGate';
import { ChoiceField, TextField } from '@/components/form';
import { KeyboardSafe } from '@/components/KeyboardSafe';
import { PausedNotice } from '@/components/PausedNotice';
import { useMyConfirmation, withCheckin } from '@/components/SpotCheckins';
import { TermsGate } from '@/components/TermsGate';
import { Banner, Button, EmptyState } from '@/components/ui';
import { CHANGE_OPTIONS, MAX_CHECKIN_NOTE, sendCheckin } from '@/data/community';
import { useSpot, useSpots } from '@/data/spots';
import { useAuth } from '@/lib/auth';
import { formatDay } from '@/lib/time';
import { hasBlockedWords } from '@/lib/wordFilter';
import { useStillHere } from '@/lib/useStillHere';
import type { ChangeKind } from '@/types';
import { colors } from '@/theme';

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function CheckinScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { status, client, termsAccepted } = useAuth();
  const { spot } = useSpot(id);
  const { saveLocal, reload } = useSpots();
  const { mine } = useMyConfirmation(spot);
  const stillHere = useStillHere();
  const [kind, setKind] = useState<ChangeKind | null>(null);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== 'signed-in') {
    return <AccountGate status={status} next={`/checkin/${id ?? ''}`} action="Reporting a change" />;
  }
  if (termsAccepted !== true) return <TermsGate />;
  if (!spot) {
    return (
      <View style={styles.center}>
        <EmptyState icon="compass-outline" title="Spot not found" message="It may have been removed." />
      </View>
    );
  }

  const kindError = tried && !kind ? 'Choose what changed.' : null;
  const noteError = hasBlockedWords(note) ? "Some words aren't allowed on DisCamp." : null;

  const send = async () => {
    setTried(true);
    if (!kind || noteError) {
      AccessibilityInfo.announceForAccessibility(noteError ?? 'Choose what changed.');
      return;
    }
    if (!client) return;
    setSending(true);
    setError(null);
    try {
      await sendCheckin(client, spot.id, kind, note);
      saveLocal(withCheckin(spot, kind, new Date().toISOString()));
      // Taking back a "Still good" can change when the spot was last
      // confirmed; the server's copy has it.
      if (mine && !mine.withdrawn) void reload();
      AccessibilityInfo.announceForAccessibility('Thanks for the update');
      if (stillHere()) close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardSafe>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
      >
        <PausedNotice what="posting" />
        <View style={styles.intro}>
          <Text style={styles.title} accessibilityRole="header">
            What changed?
          </Text>
          <Text style={styles.body}>
            At “{spot.name}”. Other campers see it on the spot until someone says it&apos;s still good.
          </Text>
          {mine && !mine.withdrawn ? (
            <Text style={styles.body}>
              This takes back your &ldquo;Still good&rdquo; from {formatDay(mine.at) ?? 'before'}.
            </Text>
          ) : null}
        </View>
        <ChoiceField
          label="What changed"
          options={CHANGE_OPTIONS}
          value={kind}
          onChange={(value) => setKind(value)}
          allowNotSure={false}
          error={kindError}
        />
        <TextField
          label="Details"
          value={note}
          onChangeText={setNote}
          hint="Optional. For example: washed out a mile in, high clearance can still get through."
          maxLength={MAX_CHECKIN_NOTE}
          error={noteError}
          multiline
        />
        {error ? <Banner tone="error" message={error} announceKey={error} /> : null}
        <Button label="Send" icon="send-outline" loading={sending} onPress={() => void send()} />
        <Button label="Cancel" kind="secondary" disabled={sending} onPress={close} />
      </ScrollView>
    </KeyboardSafe>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: colors.bg },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  intro: { gap: 6 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink },
  body: { fontSize: 15, color: colors.body, lineHeight: 21 },
});
