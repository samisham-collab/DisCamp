// My Rig: pick a preset or set your own clearance, drivetrain, setup and
// length. Saved on the phone automatically.

import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, Pills, SectionTitle, Stepper } from '@/components/ui';
import { MAX_RIG_NAME_LENGTH } from '@/config';
import { RIG_DRIVETRAINS, RIG_SETUPS, isTowing, maxTierFor, tierInfo } from '@/lib/fit';
import { RIG_PRESETS, useRig } from '@/lib/rig';
import { CLEARANCE_RANGE, LENGTH_RANGE, matchingPreset, rigDisplayName, rigSummary } from '@/lib/rigModel';
import type { ClearanceTier, RigDrivetrain, RigSetup } from '@/types';
import { colors, radius } from '@/theme';

const DRIVETRAIN_OPTIONS = (Object.keys(RIG_DRIVETRAINS) as RigDrivetrain[]).map((value) => ({
  value,
  label: RIG_DRIVETRAINS[value].label,
}));

const SETUP_OPTIONS = (Object.keys(RIG_SETUPS) as RigSetup[]).map((value) => ({
  value,
  label: RIG_SETUPS[value].label,
}));

const PRESET_OPTIONS = RIG_PRESETS.map((p) => ({ value: p.name, label: p.name }));

export default function RigScreen() {
  const { rig, setRig, updateRig } = useRig();
  const preset = matchingPreset(rig);
  const maxTier = maxTierFor(rig.clearanceIn);
  const tierText =
    maxTier === 0
      ? 'Under 2" of clearance: every road will be too rough.'
      : `Handles roads up to C${maxTier} (${tierInfo(maxTier as ClearanceTier).label}): ${tierInfo(
          maxTier as ClearanceTier,
        ).road.toLowerCase()}.`;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      // iOS: make room for the keyboard and let a drag pull it down.
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
    >
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Checking spots for</Text>
        <Text style={styles.summaryName}>{rigDisplayName(rig)}</Text>
        <Text style={styles.summaryDetail}>{rigSummary(rig)}</Text>
      </View>

      {/* The name sits near the top so the keyboard can never cover it. */}
      <Card>
        <Text style={styles.label}>Rig name</Text>
        <TextInput
          value={rig.name}
          onChangeText={(name) => updateRig({ name })}
          style={styles.input}
          accessibilityLabel="Rig name"
          placeholder="e.g. My truck"
          placeholderTextColor={colors.muted}
          maxLength={MAX_RIG_NAME_LENGTH}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
        />
      </Card>

      <Card>
        <SectionTitle>Start from a preset</SectionTitle>
        <Pills
          mode="single"
          options={PRESET_OPTIONS}
          isSelected={(name) => preset?.name === name}
          onPress={(name) => {
            const next = RIG_PRESETS.find((p) => p.name === name);
            if (next) setRig(next);
          }}
          accessibilityLabel="Rig presets"
        />
        {!preset && <Text style={styles.hint}>Custom rig: your changes are saved.</Text>}
      </Card>

      <Card>
        <SectionTitle>Your rig</SectionTitle>

        <Text style={styles.label}>Ground clearance</Text>
        <Stepper
          label="Ground clearance"
          value={rig.clearanceIn}
          onChange={(clearanceIn) => updateRig({ clearanceIn })}
          step={CLEARANCE_RANGE.step}
          min={CLEARANCE_RANGE.min}
          max={CLEARANCE_RANGE.max}
          unit="in"
          unitSpoken="inches"
        />
        <Text style={styles.hint}>{tierText}</Text>

        <Text style={styles.label}>Drivetrain</Text>
        <Pills
          mode="single"
          options={DRIVETRAIN_OPTIONS}
          isSelected={(d) => d === rig.drivetrain}
          onPress={(drivetrain) => updateRig({ drivetrain })}
          accessibilityLabel="Drivetrain"
        />

        <Text style={styles.label}>How you camp</Text>
        <Pills
          mode="single"
          options={SETUP_OPTIONS}
          isSelected={(s) => s === rig.setup}
          onPress={(setup) => updateRig({ setup })}
          accessibilityLabel="How you camp"
        />

        {isTowing(rig) && (
          <View style={styles.lengthBlock}>
            <Text style={styles.label}>{rig.setup === 'bigrig' ? 'Rig length' : 'Trailer length'}</Text>
            <Stepper
              label={rig.setup === 'bigrig' ? 'Rig length' : 'Trailer length'}
              value={rig.lengthFt}
              onChange={(lengthFt) => updateRig({ lengthFt })}
              step={LENGTH_RANGE.step}
              min={LENGTH_RANGE.min}
              max={LENGTH_RANGE.max}
              unit="ft"
              unitSpoken="feet"
            />
          </View>
        )}
      </Card>

      <Text style={styles.saved}>Saved on this phone. Pins, lists and spot pages update right away.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  summary: {
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.pine,
    gap: 2,
  },
  summaryLabel: { fontSize: 13, color: '#D7E8DE' },
  summaryName: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  summaryDetail: { fontSize: 15, color: '#FFFFFF' },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink, marginTop: 6 },
  hint: { fontSize: 14, color: colors.body },
  input: {
    minHeight: 46,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.sm,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.card,
  },
  lengthBlock: { gap: 6 },
  saved: { fontSize: 13, color: colors.muted, textAlign: 'center' },
});
