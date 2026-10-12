// What the add and edit screens share: checking the draft, showing errors
// only after the first try to save (then live as fields are fixed), and
// sending it to the server.

import { useCallback, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { SpotWriteError } from '../data/spotWrites';
import type { Spot } from '../types';
import { describeError } from './log';
import { checkDraft, type DraftErrors, type SpotDraft, type SpotInput } from './spotDraft';

export interface SpotEditor {
  errors: DraftErrors;
  /** Goes up each time saving is refused for field errors, so the form can scroll to them. */
  failedTries: number;
  formError: string | null;
  saving: boolean;
  /** Clears a server error when the camper changes something. */
  edited: () => void;
  submit: () => Promise<Spot | null>;
}

export function useSpotEditor(
  draft: SpotDraft,
  save: (input: SpotInput) => Promise<Spot>,
  /** The server asked for the terms of use first (they changed): show them again. */
  onTermsRequired?: () => void,
): SpotEditor {
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failedTries, setFailedTries] = useState(0);
  const check = useMemo(() => checkDraft(draft), [draft]);

  const errors = tried ? check.errors : {};
  const count = Object.keys(errors).length;
  const formError =
    count > 0 ? `Fix the ${count === 1 ? 'field' : `${count} fields`} marked in red, then try again.` : serverError;

  const edited = useCallback(() => setServerError(null), []);

  const submit = useCallback(async (): Promise<Spot | null> => {
    setTried(true);
    setServerError(null);
    if (!check.input) {
      setFailedTries((n) => n + 1);
      const n = Object.keys(check.errors).length;
      AccessibilityInfo.announceForAccessibility(`${n} ${n === 1 ? 'field needs' : 'fields need'} fixing.`);
      return null;
    }
    setSaving(true);
    try {
      return await save(check.input);
    } catch (error) {
      if (error instanceof SpotWriteError && error.kind === 'terms') onTermsRequired?.();
      const message = error instanceof SpotWriteError ? error.message : describeError(error);
      setServerError(message);
      AccessibilityInfo.announceForAccessibility(message);
      return null;
    } finally {
      setSaving(false);
    }
  }, [check, save, onTermsRequired]);

  return { errors, failedTries, formError, saving, edited, submit };
}
