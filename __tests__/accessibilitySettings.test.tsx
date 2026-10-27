import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useReducedMotion, useScreenReader } from '@/lib/accessibility';

type Listener = (value: boolean) => void;

function captureListeners() {
  const listeners = new Map<string, Listener>();
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((event: string, listener: Listener) => {
    listeners.set(event, listener);
    return { remove: () => listeners.delete(event) };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
  return listeners;
}

describe('accessibility settings', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('follows Reduce Motion as it changes', async () => {
    const listeners = captureListeners();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { result, unmount } = renderHook(() => useReducedMotion());
    await waitFor(() => expect(result.current).toBe(true));
    act(() => listeners.get('reduceMotionChanged')?.(false));
    expect(result.current).toBe(false);
    unmount();
    expect(listeners.has('reduceMotionChanged')).toBe(false);
  });

  it('follows the screen reader, and assumes off if the phone can’t say', async () => {
    const listeners = captureListeners();
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockRejectedValue(new Error('no answer'));
    const { result } = renderHook(() => useScreenReader());
    await act(async () => undefined);
    expect(result.current).toBe(false);
    act(() => listeners.get('screenReaderChanged')?.(true));
    expect(result.current).toBe(true);
  });
});
