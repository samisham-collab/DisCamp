// Form fields for the account and "Add a spot" screens. Each one carries its
// own label, hint and error so screen readers hear all three.

import type { ReactNode, Ref } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius } from '../theme';
import { Pills } from './ui';

export function FieldLabel({ children, required = false }: { children: ReactNode; required?: boolean }) {
  return (
    <Text style={styles.label}>
      {children}
      {required ? <Text style={styles.required}> (required)</Text> : null}
    </Text>
  );
}

export function FieldNote({ hint, error }: { hint?: string; error?: string | null }) {
  if (error) {
    return (
      <Text style={styles.error} accessibilityRole="alert">
        {error}
      </Text>
    );
  }
  return hint ? <Text style={styles.hint}>{hint}</Text> : null;
}

interface TextFieldProps extends Omit<TextInputProps, 'style' | 'accessibilityLabel' | 'accessibilityHint'> {
  ref?: Ref<TextInput>;
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
}

export function TextField({ ref, label, hint, error, required = false, multiline, ...input }: TextFieldProps) {
  return (
    <View style={styles.field}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <TextInput
        ref={ref}
        {...input}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline, error ? styles.inputError : null]}
        placeholderTextColor={colors.muted}
        accessibilityLabel={required ? `${label}, required` : label}
        accessibilityHint={error ?? hint}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
      <FieldNote hint={hint} error={error} />
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
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
  hint?: string;
  error?: string | null;
  notSureLabel?: string;
  allowNotSure?: boolean;
}) {
  const NOT_SURE = '__not_sure__';
  const all = allowNotSure ? [...options, { value: NOT_SURE as T, label: notSureLabel }] : options;
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <Pills
        mode="single"
        options={all}
        isSelected={(v) => (v === NOT_SURE ? value === null : v === value)}
        onPress={(v) => onChange(v === NOT_SURE ? null : v)}
        accessibilityLabel={label}
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
