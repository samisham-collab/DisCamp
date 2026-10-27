// The "Add a spot" and "Edit spot" form. Only the name, land manager and
// location are required; everything else can stay "Not sure", which shows as
// "Not reported" until a camper fills it in.

import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CLEARANCE_TIERS, SPOT_DRIVETRAINS, tierInfo } from '../lib/fit';
import { formatDistance } from '../lib/geo';
import { useReducedMotion } from '../lib/accessibility';
import { useLocation } from '../lib/location';
import { coordinatesText, parseCoordinates, type DraftErrors, type DraftField, type SpotDraft } from '../lib/spotDraft';
import type { ClearanceTier, Hookup, Reservations, SpotDrivetrain } from '../types';
import { colors, TOUCH_TARGET } from '../theme';
import { ChoiceField, FieldLabel, FieldNote, TextField, YesNoField } from './form';
import { LOCATION_PICKER_AVAILABLE, LocationPicker } from './LocationPicker';
import { Banner, Button, Card, Pills, SectionTitle } from './ui';
import { KeyboardSafe } from './KeyboardSafe';

const SITE_TYPES = [
  { value: 'dispersed', label: 'Dispersed' },
  { value: 'campground', label: 'Campground' },
] as const;

const TIER_OPTIONS = CLEARANCE_TIERS.map((t) => ({ value: String(t.tier), label: `C${t.tier} · ${t.label}` }));

const DRIVETRAIN_OPTIONS = (Object.keys(SPOT_DRIVETRAINS) as SpotDrivetrain[]).map((value) => ({
  value,
  label: SPOT_DRIVETRAINS[value].label,
}));

const FEE_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'paid', label: 'Paid' },
] as const;

const HOOKUP_OPTIONS: readonly { value: Hookup | 'none'; label: string }[] = [
  { value: 'electric', label: 'Electric' },
  { value: 'water', label: 'Water' },
  { value: 'sewer', label: 'Sewer' },
  { value: 'none', label: 'None' },
];

const RESERVATION_OPTIONS: readonly { value: Reservations; label: string }[] = [
  { value: 'first-come', label: 'First come, first served' },
  { value: 'reservable', label: 'Reservations available' },
  { value: 'not-needed', label: 'Not needed' },
];

/** The form's cards, top to bottom, and the fields that can show an error in each. */
const SECTIONS = {
  where: ['coordinates'],
  about: ['name', 'landManager', 'stayLimitDays'],
  access: ['surface'],
  fits: ['maxTrailerFt'],
  cost: ['feeAmount', 'rvFee', 'costNotes'],
  more: ['amenities', 'rules', 'directions', 'phone'],
} as const satisfies Record<string, readonly DraftField[]>;

type Section = keyof typeof SECTIONS;

/** "Use my location" listens this long for a fix within SPOT_FIX_M meters. */
const SPOT_FIX_M = 50;
const SPOT_REFINE_MS = 15_000;

export interface SpotFormProps {
  draft: SpotDraft;
  onChange: (patch: Partial<SpotDraft>) => void;
  errors: DraftErrors;
  /** Goes up each time saving is refused for field errors: scroll to the first one. */
  failedTries: number;
  /** A spot already on the map close to the pin, to avoid duplicates. */
  nearby: { name: string; miles: number; onOpen: () => void } | null;
  /** A problem with the whole form, e.g. "Fix the 2 fields marked in red." */
  formError: string | null;
  saving: boolean;
  submitLabel: string;
  onSubmit: () => void;
  /** New spots only: start over. */
  onDiscard?: () => void;
  /** Shown at the top, e.g. that new spots are paused for now. */
  notice?: ReactNode;
}

export function SpotForm({
  draft,
  onChange,
  errors,
  failedTries,
  nearby,
  formError,
  saving,
  submitLabel,
  onSubmit,
  onDiscard,
  notice,
}: SpotFormProps) {
  const { coords: here, locating, refine } = useLocation();
  const reducedMotion = useReducedMotion();
  // How sure "Use my location" was, when it wasn't very.
  const [fixNote, setFixNote] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [picking, setPicking] = useState(false);
  const pin = parseCoordinates(draft.coordinates);
  const scroll = useRef<ScrollView>(null);
  // Where each card starts, measured as it lays out.
  const sectionTop = useRef<Partial<Record<Section, number>>>({});

  // After a refused save, bring the first field that needs fixing into view.
  const scrollToFirstError = useEffectEvent(() => {
    const first = (Object.keys(SECTIONS) as Section[]).find((section) =>
      SECTIONS[section].some((field) => errors[field]),
    );
    const y = first ? sectionTop.current[first] : undefined;
    if (y != null) scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: !reducedMotion });
  });
  useEffect(() => {
    if (failedTries > 0) scrollToFirstError();
  }, [failedTries]);
  const tier = draft.clearanceTier;

  // A fix from right now (never one from minutes ago, a few miles back down
  // the road), listening a little longer for one within 50 m.
  const fillFromMyLocation = async () => {
    setFinding(true);
    try {
      const found = await refine(SPOT_FIX_M, SPOT_REFINE_MS);
      if (!found) return;
      onChange({ coordinates: coordinatesText(found) });
      setFixNote(
        found.accuracy != null && found.accuracy > SPOT_FIX_M
          ? `Your phone placed you within about ${Math.round(found.accuracy)} m. Check it with Drop a pin, or type the exact spot.`
          : null,
      );
    } finally {
      setFinding(false);
    }
  };

  return (
    <KeyboardSafe>
      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        testID="spot-form"
      >
        {notice}
        <View
          onLayout={(e) => {
            sectionTop.current.where = e.nativeEvent.layout.y;
          }}
          testID="section-where"
        >
          <Card>
            <SectionTitle>Where</SectionTitle>
            <TextField
              label="GPS location"
              required
              value={draft.coordinates}
              onChangeText={(coordinates) => {
                setFixNote(null);
                onChange({ coordinates });
              }}
              placeholder="e.g. 46.65300, -121.61400"
              hint="Latitude, longitude in decimal degrees. Drop a pin, use your location, or paste it."
              error={errors.coordinates}
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
              autoCapitalize="none"
              maxLength={200}
            />
            <View style={styles.buttonRow}>
              {LOCATION_PICKER_AVAILABLE ? (
                <View style={styles.half}>
                  <Button
                    label="Drop a pin"
                    icon="location-outline"
                    kind="secondary"
                    onPress={() => setPicking(true)}
                  />
                </View>
              ) : null}
              <View style={styles.half}>
                <Button
                  label="Use my location"
                  icon="locate"
                  kind="secondary"
                  loading={finding || locating}
                  onPress={() => void fillFromMyLocation()}
                />
              </View>
            </View>
            {fixNote ? <Banner tone="info" icon="locate-outline" message={fixNote} announceKey={fixNote} /> : null}
            {pin && pin.longitude > 0 ? (
              // A dropped minus sign puts a Washington spot in China.
              <Banner
                tone="warning"
                icon="globe-outline"
                message={`That's east of Greenwich, outside North America. For a spot in the US the second number is negative, like ${pin.latitude}, -${pin.longitude}.`}
                announceKey="east-longitude"
              />
            ) : null}
            {nearby ? (
              <Banner
                tone="info"
                icon="copy-outline"
                message={`${nearby.name} is ${formatDistance(nearby.miles).toLowerCase()} away. If it's the same place, add what you know there instead.`}
                actionLabel="Open it"
                onAction={nearby.onOpen}
              />
            ) : null}
          </Card>
        </View>

        <View
          onLayout={(e) => {
            sectionTop.current.about = e.nativeEvent.layout.y;
          }}
          testID="section-about"
        >
          <Card>
            <SectionTitle>About the spot</SectionTitle>
            <TextField
              label="Name"
              required
              value={draft.name}
              onChangeText={(name) => onChange({ name })}
              placeholder="e.g. Forest Road 46 pull-off"
              error={errors.name}
              maxLength={160}
              autoCapitalize="words"
            />
            <ChoiceField
              label="Type"
              options={SITE_TYPES}
              value={draft.siteType}
              onChange={(siteType) => onChange({ siteType: siteType ?? 'dispersed' })}
              allowNotSure={false}
            />
            <TextField
              label="Land manager"
              required
              value={draft.landManager}
              onChangeText={(landManager) => onChange({ landManager })}
              placeholder="e.g. BLM, National Forest, state land"
              hint="Who runs the land. Write 'Not sure' if you don't know."
              error={errors.landManager}
              maxLength={160}
              autoCapitalize="words"
            />
            <TextField
              label="Stay limit (days)"
              value={draft.stayLimitDays}
              onChangeText={(stayLimitDays) => onChange({ stayLimitDays })}
              placeholder="e.g. 14"
              error={errors.stayLimitDays}
              keyboardType="number-pad"
              maxLength={4}
            />
          </Card>
        </View>

        <View
          onLayout={(e) => {
            sectionTop.current.access = e.nativeEvent.layout.y;
          }}
          testID="section-access"
        >
          <Card>
            <SectionTitle>Getting there</SectionTitle>
            <ChoiceField
              label="Clearance needed"
              options={TIER_OPTIONS}
              value={tier == null ? null : String(tier)}
              onChange={(v) => onChange({ clearanceTier: v == null ? null : (Number(v) as ClearanceTier) })}
              hint={tier == null ? 'Rate the roughest part of the road.' : tierInfo(tier).road}
            />
            <ChoiceField
              label="Drivetrain"
              options={DRIVETRAIN_OPTIONS}
              value={draft.drivetrain}
              onChange={(drivetrain) => onChange({ drivetrain })}
            />
            <TextField
              label="Road"
              value={draft.surface}
              onChangeText={(surface) => onChange({ surface })}
              placeholder="e.g. Graded gravel, then 1 mile of ruts"
              error={errors.surface}
              maxLength={240}
            />
            <YesNoField
              label="When it's wet"
              value={draft.impassableWhenWet == null ? null : !draft.impassableWhenWet}
              onChange={(ok) => onChange({ impassableWhenWet: ok == null ? null : !ok })}
              yesLabel="OK when wet"
              noLabel="Impassable when wet"
            />
          </Card>
        </View>

        <View
          onLayout={(e) => {
            sectionTop.current.fits = e.nativeEvent.layout.y;
          }}
          testID="section-fits"
        >
          <Card>
            <SectionTitle>Who fits</SectionTitle>
            <YesNoField label="Tent ground" value={draft.tent} onChange={(tent) => onChange({ tent })} />
            <YesNoField label="Rooftop tent (level parking)" value={draft.rtt} onChange={(rtt) => onChange({ rtt })} />
            <YesNoField label="Van or truck camper" value={draft.van} onChange={(van) => onChange({ van })} />
            <TextField
              label="Longest trailer or RV (feet)"
              value={draft.maxTrailerFt}
              onChangeText={(maxTrailerFt) => onChange({ maxTrailerFt })}
              placeholder="e.g. 25"
              hint="0 if trailers can't get in. Leave empty if you're not sure."
              error={errors.maxTrailerFt}
              keyboardType="number-pad"
              maxLength={3}
            />
            <YesNoField
              label="Big rigs (40 ft and up)"
              value={draft.bigRig}
              onChange={(bigRig) => onChange({ bigRig })}
            />
            <YesNoField
              label="Room for a big rig to turn around"
              value={draft.turnaround}
              onChange={(turnaround) => onChange({ turnaround })}
            />
          </Card>
        </View>

        <View
          onLayout={(e) => {
            sectionTop.current.cost = e.nativeEvent.layout.y;
          }}
          testID="section-cost"
        >
          <Card>
            <SectionTitle>Cost</SectionTitle>
            <ChoiceField
              label="Nightly fee"
              options={FEE_OPTIONS}
              value={draft.feeKind}
              onChange={(feeKind) => onChange({ feeKind })}
            />
            {draft.feeKind === 'paid' ? (
              <TextField
                label="Fee per night ($)"
                value={draft.feeAmount}
                onChangeText={(feeAmount) => onChange({ feeAmount })}
                placeholder="e.g. 15"
                error={errors.feeAmount}
                keyboardType="decimal-pad"
                maxLength={9}
              />
            ) : null}
            <TextField
              label="RV or hookup site fee ($)"
              value={draft.rvFee}
              onChangeText={(rvFee) => onChange({ rvFee })}
              placeholder="Only if it's different"
              error={errors.rvFee}
              keyboardType="decimal-pad"
              maxLength={9}
            />
            <View style={styles.group}>
              <FieldLabel>Hookups</FieldLabel>
              <Pills
                mode="multiple"
                options={HOOKUP_OPTIONS}
                isSelected={(h) => (h === 'none' ? draft.noHookups : draft.hookups.includes(h))}
                onPress={(h) =>
                  onChange(
                    h === 'none'
                      ? { noHookups: !draft.noHookups, hookups: [] }
                      : {
                          noHookups: false,
                          hookups: draft.hookups.includes(h)
                            ? draft.hookups.filter((x) => x !== h)
                            : [...draft.hookups, h],
                        },
                  )
                }
                accessibilityLabel="Hookups"
              />
              <FieldNote hint="Leave them all off if you're not sure." />
            </View>
            <ChoiceField
              label="Reservations"
              options={RESERVATION_OPTIONS}
              value={draft.reservations}
              onChange={(reservations) => onChange({ reservations })}
            />
            <TextField
              label="Cost notes"
              value={draft.costNotes}
              onChangeText={(costNotes) => onChange({ costNotes })}
              error={errors.costNotes}
              multiline
              maxLength={600}
            />
          </Card>
        </View>

        <View
          onLayout={(e) => {
            sectionTop.current.more = e.nativeEvent.layout.y;
          }}
          testID="section-more"
        >
          <Card>
            <SectionTitle>More details</SectionTitle>
            <TextField
              label="What's there"
              value={draft.amenities}
              onChangeText={(amenities) => onChange({ amenities })}
              placeholder={'One per line, e.g.\nVault toilet\nFire ring'}
              error={errors.amenities}
              multiline
              maxLength={4000}
            />
            <TextField
              label="Rules"
              value={draft.rules}
              onChangeText={(rules) => onChange({ rules })}
              placeholder={'One per line, e.g.\nNo campfires\nPack it in, pack it out'}
              error={errors.rules}
              multiline
              maxLength={8000}
            />
            <TextField
              label="Directions"
              value={draft.directions}
              onChangeText={(directions) => onChange({ directions })}
              error={errors.directions}
              multiline
              maxLength={1200}
            />
            <TextField
              label="Land manager's phone"
              value={draft.phone}
              onChangeText={(phone) => onChange({ phone })}
              error={errors.phone}
              keyboardType="phone-pad"
              maxLength={25}
            />
          </Card>
        </View>

        {/* Announced by useSpotEditor on every refused save, once. */}
        {formError ? <Banner tone="error" message={formError} silent /> : null}
        <Button label={submitLabel} icon="checkmark" loading={saving} onPress={onSubmit} />
        {onDiscard ? (
          <Pressable onPress={onDiscard} accessibilityRole="button" style={styles.discard} disabled={saving}>
            <Text style={styles.discardText}>Discard draft</Text>
          </Pressable>
        ) : null}
        <Text style={styles.fine}>
          Spots show for everyone right away, marked &quot;not yet confirmed&quot;. Only add places where camping is
          allowed.
        </Text>

        <LocationPicker
          visible={picking}
          start={pin ?? here}
          onCancel={() => setPicking(false)}
          onPick={(point) => {
            setPicking(false);
            setFixNote(null);
            onChange({ coordinates: coordinatesText(point) });
          }}
        />
      </ScrollView>
    </KeyboardSafe>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  half: { flexGrow: 1, flexBasis: 150 },
  group: { gap: 6 },
  discard: { minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  discardText: { fontSize: 15, fontWeight: '700', color: colors.red, textDecorationLine: 'underline' },
  fine: { fontSize: 13, color: colors.muted, textAlign: 'center' },
});
