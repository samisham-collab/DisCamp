import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { RigProvider, useFitRig, useRig } from '@/lib/rig';
import { DEFAULT_RIG } from '@/lib/rigModel';

const wrapper = ({ children }: { children: ReactNode }) => <RigProvider>{children}</RigProvider>;

describe('RigProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts with the default rig once ready', async () => {
    const { result } = renderHook(() => useRig(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.rig).toEqual(DEFAULT_RIG);
  });

  it('keeps the fit inputs stable while the camper types a name', async () => {
    const { result } = renderHook(() => ({ rig: useRig(), fit: useFitRig() }), { wrapper });
    await waitFor(() => expect(result.current.rig.ready).toBe(true));
    const before = result.current.fit;

    act(() => result.current.rig.updateRig({ name: 'Blue Tacoma' }));
    expect(result.current.rig.rig.name).toBe('Blue Tacoma');
    expect(result.current.fit).toBe(before);

    act(() => result.current.rig.updateRig({ clearanceIn: 10 }));
    expect(result.current.fit).not.toBe(before);
    expect(result.current.fit.clearanceIn).toBe(10);
  });

  it('explains a missing provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useRig())).toThrow('useRig must be used inside <RigProvider>');
  });
});
