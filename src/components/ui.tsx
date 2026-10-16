// Small building blocks shared by every screen. Each one handles its own
// accessibility (roles, states, labels) so screens can't forget it.

import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useEffectEvent, type ComponentProps, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { selectionFeedback } from '../lib/haptics';
import { colors, radius, shadow, TOUCH_TARGET } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.sectionTitle} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Row({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, tone === 'warn' && styles.rowWarn]}>{value}</Text>
    </View>
  );
}

export function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

interface PillsProps<T extends string> {
  options: readonly { value: T; label: string }[];
  /** "single": pick one (radio buttons). "multiple": toggles (checkboxes). */
  mode: 'single' | 'multiple';
  isSelected: (value: T) => boolean;
  onPress: (value: T) => void;
  /** Read by screen readers for the whole group. */
  accessibilityLabel: string;
}

export function Pills<T extends string>({ options, mode, isSelected, onPress, accessibilityLabel }: PillsProps<T>) {
  return (
    <View
      style={styles.pills}
      accessibilityRole={mode === 'single' ? 'radiogroup' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((o) => {
        const on = isSelected(o.value);
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              selectionFeedback();
              onPress(o.value);
            }}
            accessibilityRole={mode === 'single' ? 'radio' : 'checkbox'}
            accessibilityState={{ checked: on }}
            style={({ pressed }) => [styles.pill, on && styles.pillOn, pressed && styles.pressed]}
          >
            <Text style={[styles.pillText, on && styles.pillTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Two or three joined buttons, one selected, like Map | List. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (!on) selectionFeedback();
              onChange(o.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.label}
            style={[styles.segment, on && styles.segmentOn]}
          >
            {o.icon && (
              <Ionicons
                accessibilityElementsHidden
                importantForAccessibility="no"
                name={o.icon}
                size={16}
                color={on ? '#FFFFFF' : colors.ink}
              />
            )}
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const formatNumber = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** − value + control. Screen readers treat it as one adjustable value. */
export function Stepper({
  value,
  onChange,
  step,
  min,
  max,
  unit,
  unitSpoken,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  unit: string;
  /** Unit read aloud, e.g. "inches" for "in". */
  unitSpoken: string;
  label: string;
}) {
  const set = (v: number) => {
    const next = Math.min(max, Math.max(min, Math.round(v * 100) / 100));
    if (next !== value) {
      selectionFeedback();
      onChange(next);
    }
  };
  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') set(value + step);
    if (e.nativeEvent.actionName === 'decrement') set(value - step);
  };
  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: `${formatNumber(value)} ${unitSpoken}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAction}
    >
      <Pressable
        onPress={() => set(value - step)}
        disabled={value <= min}
        style={({ pressed }) => [styles.stepBtn, value <= min && styles.disabled, pressed && styles.pressed]}
        accessibilityLabel={`Decrease ${label}`}
        testID={`${label}-decrease`}
      >
        <Ionicons
          accessibilityElementsHidden
          importantForAccessibility="no"
          name="remove"
          size={24}
          color={colors.pine}
        />
      </Pressable>
      <Text style={styles.stepValue}>
        {formatNumber(value)} {unit}
      </Text>
      <Pressable
        onPress={() => set(value + step)}
        disabled={value >= max}
        style={({ pressed }) => [styles.stepBtn, value >= max && styles.disabled, pressed && styles.pressed]}
        accessibilityLabel={`Increase ${label}`}
        testID={`${label}-increase`}
      >
        <Ionicons accessibilityElementsHidden importantForAccessibility="no" name="add" size={24} color={colors.pine} />
      </Pressable>
    </View>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  disabled = false,
  loading = false,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}) {
  const inactive = disabled || loading;
  const tint = kind === 'primary' ? '#FFFFFF' : colors.pine;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.btn,
        kind === 'secondary' && styles.btnSecondary,
        inactive && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tint} />
      ) : (
        icon && (
          <Ionicons name={icon} size={20} color={tint} accessibilityElementsHidden importantForAccessibility="no" />
        )
      )}
      <Text style={[styles.btnText, kind === 'secondary' && styles.btnTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

/** Round icon-only button, e.g. map controls. `label` is read by screen readers. */
export function IconButton({
  icon,
  label,
  onPress,
  busy = false,
  active = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  busy?: boolean;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, selected: active }}
      hitSlop={4}
      style={({ pressed }) => [styles.iconBtn, active && styles.iconBtnActive, pressed && styles.pressed]}
    >
      {busy ? (
        <ActivityIndicator color={colors.pine} />
      ) : (
        <Ionicons
          accessibilityElementsHidden
          importantForAccessibility="no"
          name={icon}
          size={22}
          color={active ? '#FFFFFF' : colors.pine}
        />
      )}
    </Pressable>
  );
}

/** Icon over a short label, for a row of actions. */
export function ActionButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <View style={styles.actionIcon}>
        <Ionicons
          accessibilityElementsHidden
          importantForAccessibility="no"
          name={icon}
          size={22}
          color={colors.pine}
        />
      </View>
      <Text style={styles.actionText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Banner({
  tone,
  message,
  icon,
  actionLabel,
  onAction,
  actionBusy = false,
  announceKey,
}: {
  tone: 'info' | 'warning' | 'error';
  message: string;
  /** Overrides the tone's default icon. */
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  actionBusy?: boolean;
  /**
   * Set to read the message aloud to screen-reader users when the banner
   * appears and whenever this key changes. Use what the message is about
   * (say, the error), not the text itself, which may include a changing
   * "5 min ago".
   */
  announceKey?: string;
}) {
  const palette = BANNER_TONES[tone];
  const announce = useEffectEvent(() => AccessibilityInfo.announceForAccessibility(message));
  useEffect(() => {
    if (announceKey !== undefined) announce();
  }, [announceKey]);
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }]}>
      <Ionicons
        accessibilityElementsHidden
        importantForAccessibility="no"
        name={icon ?? palette.icon}
        size={20}
        color={palette.fg}
      />
      <Text style={[styles.bannerText, { color: palette.fg }]} accessibilityRole={tone === 'info' ? 'text' : 'alert'}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          disabled={actionBusy}
          accessibilityRole="button"
          accessibilityState={{ busy: actionBusy }}
          hitSlop={8}
          style={({ pressed }) => [styles.bannerAction, pressed && styles.pressed]}
        >
          {actionBusy ? (
            <ActivityIndicator color={palette.fg} />
          ) : (
            <Text style={[styles.bannerActionText, { color: palette.fg }]}>{actionLabel}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const BANNER_TONES: Record<'info' | 'warning' | 'error', { bg: string; fg: string; icon: IconName }> = {
  info: { bg: colors.pineTint, fg: colors.pineDark, icon: 'information-circle-outline' },
  warning: { bg: colors.orangeTint, fg: colors.orangeDark, icon: 'cloud-offline-outline' },
  error: { bg: colors.redTint, fg: '#8E1B12', icon: 'alert-circle-outline' },
};

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <Ionicons accessibilityElementsHidden importantForAccessibility="no" name={icon} size={32} color={colors.muted} />
      <Text style={styles.emptyTitle} accessibilityRole="header">
        {title}
      </Text>
      {message ? <Text style={styles.emptyText}>{message}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} kind="secondary" onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  rowLabel: { color: colors.muted, fontSize: 14, flexShrink: 1 },
  rowValue: { color: colors.ink, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  rowWarn: { color: colors.red, fontWeight: '700' },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.lineSoft,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.card,
  },
  pillOn: { backgroundColor: colors.pine, borderColor: colors.pine },
  pillText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  pillTextOn: { color: '#FFFFFF' },
  segmented: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  segment: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
  },
  segmentOn: { backgroundColor: colors.pine },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  segmentTextOn: { color: '#FFFFFF' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.pine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { fontSize: 22, fontWeight: '700', color: colors.ink, minWidth: 90, textAlign: 'center' },
  btn: {
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: colors.pine,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  btnSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.pine },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  btnTextSecondary: { color: colors.pine },
  iconBtn: {
    width: TOUCH_TARGET + 4,
    height: TOUCH_TARGET + 4,
    borderRadius: (TOUCH_TARGET + 4) / 2,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  iconBtnActive: { backgroundColor: colors.pine },
  action: { flex: 1, alignItems: 'center', gap: 6, minHeight: TOUCH_TARGET, paddingVertical: 4 },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.pineTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  bannerText: { flex: 1, fontSize: 14, fontWeight: '600' },
  bannerAction: { minHeight: TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: 6 },
  bannerActionText: { fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  empty: {
    alignItems: 'center',
    gap: 10,
    padding: 20,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    ...shadow,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  emptyText: { fontSize: 15, color: colors.body, textAlign: 'center' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
});
