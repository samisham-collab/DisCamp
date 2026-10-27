// Form fields for the account and "Add a spot" screens. Each one carries its
// own label, hint and error so screen readers hear all three.

import type { ReactNode, Ref } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius } from '../theme';
import { Pills } from './ui';

/** Screen readers skip it when the field itself already says it (TextField). */
const hiddenFromReaders = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

export function FieldLabel({
  children,
  required = false,
  hidden = false,
}: {
  children: ReactNode;
  required?: boolean;
  hidden?: boolean;
}) {
  return (
    <Text style={styles.label} {...(hidden ? hiddenFromReaders : {})}>
      {children}
      {required ? <Text style={styles.required}> (required)</Text> : null}
    </Text>
  );
}

export function FieldNote({ hint, error, hidden = false }: { hint?: string; error?: string | null; hidden?: boolean }) {
  if (error) {
    return (
      // Errors stay readable on their own too: they're what a camper is looking for.
      <Text style={styles.error} accessibilityRole="alert">
        {error}
      </Text>
    );
  }
  return hint ? (
    <Text style={styles.hint} {...(hidden ? hiddenFromReaders : {})}>
      {hint}
    </Text>
  ) : null;
}

interface TextFieldProps extends Omit<TextInputProps, 'style' | 'accessibilityLabel' | 'accessibilityHint'> {
  ref?: Ref<TextInput>;
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
}

export function TextField({ ref, label, hint, error, required = false, multiline, ...input }: TextFieldProps) {
  // The field says its label, the problem and the hint, so the text around
  // it isn't read a second time.
  return (
    <View style={styles.field}>
      <FieldLabel required={required} hidden>
        {label}
      </FieldLabel>
      <TextInput
        ref={ref}
        {...input}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline, error ? styles.inputError : null]}
        placeholderTextColor={colors.muted}
        accessibilityLabel={required ? `${label}, required` : label}
        accessibilityHint={error ? [error, hint].filter(Boolean).join('. ') : hint}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
      <FieldNote hint={hint} error={error} hidden />
    </View>
  );
}

/** One choice from a short list, plus "Not sure" (null). */
export function ChoiceField<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
  error,
  notSureLabel = 'Not sure',
  allowNotSure = true,
  required = false,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
  hint?: string;
  error?: string | null;
  notSureLabel?: string;
  allowNotSure?: boolean;
  /** Says "(required)", to everyone, not just in red when it's missed. */
  required?: boolean;
}) {
  const NOT_SURE = '__not_sure__';
  const all = allowNotSure ? [...options, { value: NOT_SURE as T, label: notSureLabel }] : options;
  return (
    <View style={styles.field}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <Pills
        mode="single"
        options={all}
        isSelected={(v) => (v === NOT_SURE ? value === null : v === value)}
        onPress={(v) => onChange(v === NOT_SURE ? null : v)}
        accessibilityLabel={required ? `${label}, required` : label}
      />
      <FieldNote hint={hint} error={error} />
    </View>
  );
}

/** Yes / No / Not sure, for the "who fits" questions. */
export function YesNoField({
  label,
  value,
  onChange,
  yesLabel = 'Yes',
  noLabel = 'No',
  hint,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  yesLabel?: string;
  noLabel?: string;
  hint?: string;
}) {
  return (
    <ChoiceField
      label={label}
      options={[
        { value: 'yes', label: yesLabel },
        { value: 'no', label: noLabel },
      ]}
      value={value == null ? null : value ? 'yes' : 'no'}
      onChange={(v) => onChange(v == null ? null : v === 'yes')}
      hint={hint}
    />
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink, marginTop: 6 },
  required: { fontWeight: '400', color: colors.muted },
  hint: { fontSize: 13, color: colors.body },
  error: { fontSize: 13, fontWeight: '600', color: colors.red },
  input: {
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.sm,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.card,
  },
  multiline: { minHeight: 92 },
  inputError: { borderColor: colors.red, borderWidth: 2 },
});
