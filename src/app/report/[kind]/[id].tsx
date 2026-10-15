// Report a spot, a photo, a check-in, a cleanup, or the name of the camper
// who added one. Reports go to the moderator (an email per report), who acts within 24
// hours. After reporting something a camper posted, you can also block them.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AccountGate } from '@/components/AccountGate';
import { ChoiceField, TextField } from '@/components/form';
import { Banner, Button, EmptyState } from '@/components/ui';
import { MAX_REPORT_DETAILS, SUPPORT_EMAIL } from '@/config';
import { REPORT_REASONS, sendReport, type ReportReason, type ReportTarget } from '@/data/moderation';
import { useSpots } from '@/data/spots';
import { useAuth } from '@/lib/auth';
import { useBlockCamper } from '@/lib/useBlockCamper';
import { colors } from '@/theme';
import { KeyboardSafe } from '@/components/KeyboardSafe';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CHECKIN_ID = /^[1-9][0-9]{0,17}$/;

/** What the link points at, if it's something that can be reported. */
function reportTarget(kind: string | undefined, id: string): ReportTarget | null {
  if (kind === 'spot' && id) return { kind, id };
  if ((kind === 'camper' || kind === 'photo' || kind === 'task') && UUID.test(id)) return { kind, id };
  if (kind === 'checkin' && CHECKIN_ID.test(id)) return { kind, id };
  return null;
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** After blocking, the spot underneath is gone for this camper: back to Explore. */
function closeToExplore() {
  router.dismissTo('/');
}

export default function ReportScreen() {
  const params = useLocalSearchParams<{
    kind?: string | string[];
    id?: string | string[];
    // Photos and check-ins: who posted it, to offer blocking them afterwards.
    owner?: string | string[];
    name?: string | string[];
  }>();
  const kind = first(params.kind);
  const id = first(params.id) ?? '';
  const { status, client, user } = useAuth();
  const { spots } = useSpots();
  const { block, busy: blocking } = useBlockCamper();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'sent' | 'already' | null>(null);
  // Who added it, remembered when the report goes: once blocked, their spots
  // (and so their name) are gone from the list.
  const [camper, setCamper] = useState<{ id: string; name: string | null } | null>(null);
  const [blocked, setBlocked] = useState(false);

  const target = reportTarget(kind, id);
  if (!target) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="flag-outline"
          title="Nothing to report"
          message="This link doesn't point to a spot, photo, check-in, cleanup or camper."
        />
      </View>
    );
  }
  const spot = target.kind === 'spot' ? spots.find((s) => s.id === id) : undefined;
  // Whose spot, photo, check-in or name it is, to offer blocking them afterwards.
  const owner = first(params.owner);
  const postedBy = owner && UUID.test(owner) ? owner : undefined;
  const posted = target.kind === 'photo' || target.kind === 'checkin' || target.kind === 'task';
  const camperId = target.kind === 'camper' ? id : posted ? postedBy : spot?.createdBy;
  const camperName =
    (target.kind === 'camper'
      ? spots.find((s) => s.createdBy === id)?.addedBy
      : posted
        ? first(params.name)?.trim().slice(0, 40) || undefined
        : spot?.addedBy) ?? null;
  const next = `/report/${target.kind}/${id}`;

  if (status !== 'signed-in') {
    return (
      <AccountGate
        status={status}
        next={next}
        action="Reporting"
        message={`Sign in to send a report, so we can follow up and keep spam out.${
          SUPPORT_EMAIL ? ` Or email ${SUPPORT_EMAIL} and tell us what's wrong.` : ''
        }`}
      />
    );
  }

  if (done) {
    const canBlock = camper != null && camper.id !== user?.id && !blocked;
    const who = camper?.name ?? 'this camper';
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Ionicons name="checkmark-circle-outline" size={56} color={colors.pine} />
          <Text style={styles.title} accessibilityRole="header">
            {done === 'sent' ? 'Thanks for reporting' : 'Already reported'}
          </Text>
          <Text style={styles.body}>
            {done === 'sent'
              ? 'We review every report within 24 hours, and remove anything that breaks the rules.'
              : "You've reported this already. We review every report within 24 hours."}
          </Text>
        </View>
        {canBlock ? (
          <>
            <Text style={styles.body}>Don&apos;t want to see spots and photos from {who}?</Text>
            <Button
              label={`Block ${who}`}
              icon="eye-off-outline"
              kind="secondary"
              loading={blocking}
              onPress={() => block(camper, next, () => setBlocked(true))}
            />
          </>
        ) : null}
        {blocked ? <Banner tone="info" message={`Blocked. You won't see spots or photos from ${who}.`} /> : null}
        <Button label="Done" onPress={blocked ? closeToExplore : close} />
      </ScrollView>
    );
  }

  const reasonError = tried && !reason ? 'Choose what’s wrong.' : null;

  const send = async () => {
    setTried(true);
    if (!reason) {
      AccessibilityInfo.announceForAccessibility('Choose what’s wrong.');
      return;
    }
    if (!client) return;
    setSending(true);
    setError(null);
    try {
      const result = await sendReport(client, target, reason, details);
      setCamper(camperId ? { id: camperId, name: camperName } : null);
      setDone(result);
      AccessibilityInfo.announceForAccessibility('Report sent');
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the report. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const subject = {
    spot: spot ? `“${spot.name}”` : 'this spot',
    photo: 'this photo',
    checkin: 'this check-in',
    task: 'this cleanup',
    camper: camperName ? `the name “${camperName}”` : 'this camper’s name',
  }[target.kind];
  const title = {
    spot: 'Report this spot',
    photo: 'Report this photo',
    checkin: 'Report this check-in',
    task: 'Report this cleanup',
    camper: 'Report this name',
  }[target.kind];

  return (
    <KeyboardSafe>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
      >
        <View style={styles.introLeft}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.bodyLeft}>
            Tell us what&apos;s wrong with {subject}. Reports are private: nobody else sees who sent them.
          </Text>
        </View>

        <ChoiceField
          label="What's wrong?"
          options={REPORT_REASONS[target.kind]}
          value={reason}
          onChange={(value) => setReason(value)}
          allowNotSure={false}
          error={reasonError}
        />
        <TextField
          label="Anything else we should know?"
          value={details}
          onChangeText={setDetails}
          hint="Optional. For example: the gate is locked, or the road is on private land."
          maxLength={MAX_REPORT_DETAILS}
          multiline
        />

        {error ? <Banner tone="error" message={error} announceKey={error} /> : null}

        <Button label="Send report" icon="flag-outline" loading={sending} onPress={() => void send()} />
        <Button label="Cancel" kind="secondary" disabled={sending} onPress={close} />
      </ScrollView>
    </KeyboardSafe>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: colors.bg },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  intro: { alignItems: 'center', gap: 8, paddingTop: 16 },
  introLeft: { gap: 6 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink },
  body: { fontSize: 15, color: colors.body, lineHeight: 21, textAlign: 'center' },
  bodyLeft: { fontSize: 15, color: colors.body, lineHeight: 21 },
});
