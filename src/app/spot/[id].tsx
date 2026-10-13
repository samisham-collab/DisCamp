// Spot detail: fit for your rig, the cost meter, access and who-fits ratings,
// amenities, rules and directions. Trailers and big rigs see the cost meter
// first, priced on the RV hookup fee.

import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ClearanceGauge } from '@/components/ClearanceGauge';
import { confirmedLabel, SpotCheckins } from '@/components/SpotCheckins';
import { SpotPhotos } from '@/components/SpotPhotos';
import { CostMeter } from '@/components/CostMeter';
import { FitBanner } from '@/components/Fit';
import { siteTypeLabel } from '@/components/SpotSummary';
import { ActionButton, Banner, Button, Card, Chip, EmptyState, Row, SectionTitle } from '@/components/ui';
import { useSpot, useSpots } from '@/data/spots';
import { CHANGE_LABELS } from '@/data/community';
import { deleteSpot } from '@/data/spotWrites';
import { useAuth } from '@/lib/auth';
import { costForRig, describeRvFee, formatFee, formatHookups, knownHookups } from '@/lib/cost';
import { SPOT_DRIVETRAINS, fitFor, isTowing, tierInfo } from '@/lib/fit';
import {
  COMPASS_WORDS,
  bearingDegrees,
  compassPoint,
  distanceMiles,
  formatCoordinates,
  formatDistance,
} from '@/lib/geo';
import { callPhone, copyCoordinates, openDirections, openWebLink, shareSpot } from '@/lib/links';
import { useLocation } from '@/lib/location';
import { useRig } from '@/lib/rig';
import { useBlockCamper } from '@/lib/useBlockCamper';
import { useStillHere } from '@/lib/useStillHere';
import { rigDisplayName } from '@/lib/rigModel';
import { formatDay, timeAgo } from '@/lib/time';
import type { Coordinates, Reservations, Rig, Spot } from '@/types';
import { colors, TOUCH_TARGET } from '@/theme';

const yesNo = (v: boolean | null, yes = 'Yes', no = 'No') => (v == null ? 'Not reported' : v ? yes : no);

const RESERVATIONS: Record<Reservations, string> = {
  'first-come': 'First come, first served',
  reservable: 'Reservations available',
  'not-needed': 'No reservations needed',
};

/** "11 mi south of you, in a straight line". */
function distanceFrom(here: Coordinates, spot: Spot): string {
  const miles = distanceMiles(here, spot);
  if (miles < 0.1) return `${formatDistance(miles)} from you`;
  const direction = COMPASS_WORDS[compassPoint(bearingDegrees(here, spot))];
  return `${formatDistance(miles)} ${direction} of you, in a straight line`;
}

function reportsLabel(count: number): string {
  if (count <= 0) return 'No camper reports yet';
  return `${count} camper ${count === 1 ? 'report' : 'reports'}`;
}

function costTitle(rig: Rig): string {
  if (rig.setup === 'bigrig') return 'Big-rig cost meter';
  if (rig.setup === 'trailer') return 'Trailer cost meter';
  return 'Cost to stay';
}

function CostCard({ spot, rig }: { spot: Spot; rig: Rig }) {
  const cost = costForRig(spot, rig);
  const { nightlyFeeUsd, reservations, notes } = spot.cost;
  return (
    <Card style={isTowing(rig) ? styles.costHighlight : undefined}>
      <SectionTitle>{costTitle(rig)}</SectionTitle>
      <Text style={styles.costFor}>
        For your rig: <Text style={styles.costStrong}>{formatFee(cost.feeUsd)}</Text> ({cost.basis})
      </Text>
      <CostMeter level={cost.level} />
      <Row label="Standard / dry camping" value={formatFee(nightlyFeeUsd)} />
      <Row label="RV site" value={describeRvFee(spot)} />
      <Row label="Hookups" value={formatHookups(knownHookups(spot))} />
      <Row label="Reservations" value={reservations ? RESERVATIONS[reservations] : 'Not reported'} />
      {notes ? <Text style={styles.note}>{notes}</Text> : null}
    </Card>
  );
}

function useCopiedFlag(): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return [copied, () => setCopied(true)];
}

export default function SpotScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { spot, loading } = useSpot(id);
  const { rig } = useRig();
  const { coords } = useLocation();
  const { user, client } = useAuth();
  const { removeLocal } = useSpots();
  const [copied, markCopied] = useCopiedFlag();
  const [deleting, setDeleting] = useState(false);
  const { block, busy: blocking } = useBlockCamper();
  const stillHere = useStillHere();

  if (!spot) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: loading ? 'Loading' : 'Not found' }} />
        {loading ? (
          <>
            <ActivityIndicator size="large" color={colors.pine} />
            <Text style={styles.body}>Loading spot…</Text>
          </>
        ) : (
          <EmptyState
            icon="compass-outline"
            title="Spot not found"
            message="It may have been removed, or the link is wrong."
            actionLabel="Back to the map"
            onAction={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        )}
      </View>
    );
  }

  const fit = fitFor(spot, rig);
  const tier = spot.access.clearanceTier;
  const drive = spot.access.drivetrain;
  const towing = isTowing(rig);
  const f = spot.fit;
  const distance = coords ? distanceFrom(coords, spot) : null;

  const mine = user != null && spot.createdBy === user.id;
  const addedOn = formatDay(spot.createdAt);
  const camperName = spot.addedBy ?? 'this camper';

  const onDelete = () => {
    Alert.alert('Delete this spot?', 'It comes off the map for everyone. This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (!client) return;
          setDeleting(true);
          void deleteSpot(client, spot.id).then(
            () => {
              removeLocal(spot.id);
              AccessibilityInfo.announceForAccessibility('Spot deleted');
              if (!stillHere()) return;
              if (router.canGoBack()) router.back();
              else router.replace('/');
            },
            (error: unknown) => {
              setDeleting(false);
              Alert.alert("Couldn't delete the spot", error instanceof Error ? error.message : 'Please try again.');
            },
          );
        },
      },
    ]);
  };

  const onCopy = async () => {
    if (await copyCoordinates(spot)) {
      markCopied();
      AccessibilityInfo.announceForAccessibility('Coordinates copied');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Spot details' }} />

      <View style={styles.titleBlock}>
        <Text style={styles.name} accessibilityRole="header">
          {spot.name}
        </Text>
        <Text style={styles.meta}>
          {siteTypeLabel(spot)} · {spot.landManager}
        </Text>
        <Text style={styles.meta}>
          {spot.stayLimitDays ? `${spot.stayLimitDays}-day stay limit` : 'Stay limit not reported'} ·{' '}
          {reportsLabel(spot.reportCount)}
        </Text>
        {distance ? <Text style={styles.meta}>{distance}</Text> : null}
        {spot.createdBy ? (
          <Text style={styles.meta}>
            Added by {mine ? 'you' : (spot.addedBy ?? 'a camper')}
            {addedOn ? ` on ${addedOn}` : ''}
          </Text>
        ) : null}
        <Text style={styles.meta}>{confirmedLabel(spot)}</Text>
      </View>

      {(spot.alerts ?? []).map((alert) => (
        <Banner
          key={`${alert.kind}-${alert.at}`}
          tone="warning"
          icon="alert-circle-outline"
          message={`${CHANGE_LABELS[alert.kind]}: reported ${timeAgo(alert.at) ?? 'recently'}. Check before you go.`}
        />
      ))}

      {spot.hidden ? (
        <Banner
          tone="warning"
          icon="eye-off-outline"
          message="Hidden while DisCamp reviews reports about it. Only you can see it. Fix anything that's wrong, and we'll take another look."
        />
      ) : null}

      {!spot.verified && (
        <Banner
          tone="warning"
          icon="information-circle-outline"
          message={
            spot.createdBy
              ? 'Added by a camper, not yet confirmed by others. Items marked "Not reported" need a camper to check.'
              : 'Starter info from public listings, not yet confirmed on site. Items marked "Not reported" need a camper to check.'
          }
        />
      )}

      {mine ? (
        <Card>
          <SectionTitle>Your spot</SectionTitle>
          <Text style={styles.body}>You added this spot. Fix anything that&apos;s wrong or missing.</Text>
          <Button
            label="Edit spot"
            icon="create-outline"
            kind="secondary"
            onPress={() => router.push({ pathname: '/spot/edit/[id]', params: { id: spot.id } })}
          />
          <Pressable
            onPress={onDelete}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityState={{ busy: deleting, disabled: deleting }}
            style={styles.deleteButton}
          >
            {deleting ? <ActivityIndicator color={colors.red} /> : <Text style={styles.deleteText}>Delete spot</Text>}
          </Pressable>
        </Card>
      ) : null}

      <FitBanner fit={fit} rigName={rigDisplayName(rig)} />

      <View style={styles.actions}>
        <Button label="Directions" icon="navigate-outline" onPress={() => void openDirections(spot)} />
        <View style={styles.actionRow}>
          <ActionButton icon="share-outline" label="Share" onPress={() => void shareSpot(spot)} />
          <ActionButton
            icon={copied ? 'checkmark' : 'copy-outline'}
            label={copied ? 'Copied' : 'Copy GPS'}
            onPress={() => void onCopy()}
          />
          {spot.phone ? (
            <ActionButton icon="call-outline" label="Call" onPress={() => void callPhone(spot.phone ?? '')} />
          ) : null}
        </View>
      </View>

      <SpotPhotos spot={spot} />

      {towing && <CostCard spot={spot} rig={rig} />}

      <Card>
        <SectionTitle>Access</SectionTitle>
        <ClearanceGauge tier={tier} />
        <Text style={styles.tierLine}>
          {tier == null ? 'Clearance not reported' : `C${tier} · needs ${tierInfo(tier).label} of clearance`}
        </Text>
        {tier != null && <Text style={styles.body}>{tierInfo(tier).road}</Text>}
        <Row label="Drivetrain" value={drive ? SPOT_DRIVETRAINS[drive].label : 'Not reported'} />
        <Row label="Road" value={spot.access.surface ?? 'Not reported'} />
        <Row
          label="When wet"
          value={yesNo(spot.access.impassableWhenWet, 'Impassable when wet', 'OK when wet')}
          tone={spot.access.impassableWhenWet ? 'warn' : undefined}
        />
      </Card>

      <Card>
        <SectionTitle>Who fits</SectionTitle>
        <Row label="Tent" value={yesNo(f.tent)} />
        <Row label="Rooftop tent" value={yesNo(f.rtt)} />
        <Row label="Van / truck camper" value={yesNo(f.van)} />
        <Row
          label="Longest trailer or RV"
          value={
            f.maxTrailerFt == null ? 'Not reported' : f.maxTrailerFt === 0 ? 'No trailers' : `${f.maxTrailerFt} ft`
          }
        />
        <Row label="Big rigs" value={yesNo(f.bigRig)} />
        <Row label="Big-rig turnaround" value={yesNo(f.turnaround)} />
      </Card>

      {!towing && <CostCard spot={spot} rig={rig} />}

      {spot.amenities.length > 0 && (
        <Card>
          <SectionTitle>What&apos;s there</SectionTitle>
          <View style={styles.chips}>
            {spot.amenities.map((a, i) => (
              <Chip key={`${i}-${a}`} label={a} />
            ))}
          </View>
        </Card>
      )}

      {spot.rules.length > 0 && (
        <Card>
          <SectionTitle>Rules</SectionTitle>
          {spot.rules.map((r, i) => (
            <Text key={`${i}-${r}`} style={styles.body}>
              • {r}
            </Text>
          ))}
        </Card>
      )}

      <Card>
        <SectionTitle>Getting there</SectionTitle>
        {spot.directions ? <Text style={styles.body}>{spot.directions}</Text> : null}
        <Row label="GPS" value={`${formatCoordinates(spot)}${spot.verified ? '' : ' (approximate)'}`} />
        {spot.phone ? <Row label="Phone" value={spot.phone} /> : null}
      </Card>

      {spot.sources.length > 0 && (
        <View style={styles.sources}>
          <Text style={styles.sourcesTitle}>Sources</Text>
          {spot.sources.map((s, i) => (
            <Pressable
              key={`${i}-${s.url}`}
              onPress={() => void openWebLink(s.url)}
              accessibilityRole="link"
              accessibilityHint="Opens in your browser"
              style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
            >
              <Text style={styles.link}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <SpotCheckins spot={spot} />

      {!mine ? (
        <Card>
          <SectionTitle>Something wrong?</SectionTitle>
          <Text style={styles.body}>
            Report a spot that&apos;s fake, unsafe, spam or offensive. We review every report within 24 hours.
          </Text>
          <Button
            label="Report this spot"
            icon="flag-outline"
            kind="secondary"
            onPress={() => router.push({ pathname: '/report/[kind]/[id]', params: { kind: 'spot', id: spot.id } })}
          />
          {spot.createdBy ? (
            <View style={styles.camperActions}>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/report/[kind]/[id]',
                    params: { kind: 'camper', id: spot.createdBy ?? '' },
                  })
                }
                accessibilityRole="button"
                style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
              >
                <Text style={styles.textButtonLabel}>
                  Report {spot.addedBy ? `the name “${spot.addedBy}”` : 'their name'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  block({ id: spot.createdBy ?? '', name: spot.addedBy ?? null }, `/spot/${spot.id}`, leave)
                }
                disabled={blocking}
                accessibilityRole="button"
                accessibilityHint="Hides every spot this camper adds, for you only"
                accessibilityState={{ busy: blocking, disabled: blocking }}
                style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
              >
                {blocking ? (
                  <ActivityIndicator color={colors.pine} />
                ) : (
                  <Text style={styles.textButtonLabel}>Block {camperName}</Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </Card>
      ) : null}

      <Text style={styles.disclaimer}>
        Ratings are community reports, not guarantees. Conditions change; check with the land manager before you go.
      </Text>
    </ScrollView>
  );
}

/** Off this spot's page, which is about to disappear (its camper was blocked). */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

const styles = StyleSheet.create({
  camperActions: { gap: 0 },
  textButton: { minHeight: TOUCH_TARGET, justifyContent: 'center' },
  textButtonLabel: { fontSize: 15, fontWeight: '600', color: colors.pine, textDecorationLine: 'underline' },
  deleteButton: { minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 15, fontWeight: '700', color: colors.red, textDecorationLine: 'underline' },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  titleBlock: { gap: 4 },
  name: { fontSize: 30, fontWeight: '800', color: colors.ink },
  meta: { fontSize: 14, color: colors.muted },
  actions: { gap: 12 },
  actionRow: { flexDirection: 'row', gap: 8 },
  costHighlight: { borderColor: colors.orange, borderWidth: 1.5 },
  costFor: { fontSize: 15, color: colors.body },
  costStrong: { fontWeight: '800', color: colors.ink },
  note: { fontSize: 14, color: colors.body, marginTop: 4 },
  tierLine: { fontSize: 16, fontWeight: '700', color: colors.ink },
  body: { fontSize: 15, color: colors.body, lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sources: { gap: 0 },
  sourcesTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  linkRow: { minHeight: TOUCH_TARGET, justifyContent: 'center' },
  link: { fontSize: 14, color: colors.pine, textDecorationLine: 'underline' },
  pressed: { opacity: 0.6 },
  disclaimer: { fontSize: 12, color: colors.muted },
});
