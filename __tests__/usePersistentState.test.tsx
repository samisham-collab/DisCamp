import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { z } from 'zod';

import { kvStore } from '@/lib/kvStore';
import { usePersistentState } from '@/lib/usePersistentState';

const schema = z.object({ count: z.number() });
type Value = z.infer<typeof schema>;
const identity = (v: Value) => v;
const clampToTen = (v: Value) => ({ count: Math.min(10, v.count) });

describe('usePersistentState', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('starts with the default and becomes ready when nothing is saved', async () => {
    const { result } = renderHook(() => usePersistentState('k', schema, { count: 0 }, identity));
    expect(result.current[0]).toEqual({ count: 0 });
    await waitFor(() => expect(result.current[2]).toBe(true));
    expect(result.current[0]).toEqual({ count: 0 });
  });

  it('loads and normalizes a saved value', async () => {
    await kvStore.setItem('k', JSON.stringify({ count: 50 }));
    const { result } = renderHook(() => usePersistentState('k', schema, { count: 0 }, clampToTen));
    await waitFor(() => expect(result.current[2]).toBe(true));
    expect(result.current[0]).toEqual({ count: 10 });
  });

  it('ignores an invalid saved value', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await kvStore.setItem('k', JSON.stringify({ count: 'many' }));
    const { result } = renderHook(() => usePersistentState('k', schema, { count: 0 }, identity));
    await waitFor(() => expect(result.current[2]).toBe(true));
    expect(result.current[0]).toEqual({ count: 0 });
  });

  it('saves a change that arrives after the screen closed (a save finishing late)', async () => {
    await kvStore.setItem('k', JSON.stringify({ count: 3 }));
    const { result, unmount } = renderHook(() => usePersistentState('k', schema, { count: 0 }, clampToTen));
    await waitFor(() => expect(result.current[0]).toEqual({ count: 3 }));
    const update = result.current[1];
    unmount();
    update((prev) => ({ count: prev.count + 20 }));
    await waitFor(async () => expect(await kvStore.getItem('k')).toBe(JSON.stringify({ count: 10 })));
  });

  it('never lets a slow load overwrite a change the user already made', async () => {
    let finishLoad: (value: string | null) => void = () => undefined;
    jest.spyOn(kvStore, 'getItem').mockReturnValueOnce(
      new Promise<string | null>((resolve) => {
        finishLoad = resolve;
      }),
    );
    const { result } = renderHook(() => usePersistentState('k', schema, { count: 0 }, identity));
    act(() => result.current[1]({ count: 7 }));
    await act(async () => finishLoad(JSON.stringify({ count: 3 })));
    await waitFor(() => expect(result.current[2]).toBe(true));
    expect(result.current[0]).toEqual({ count: 7 });
  });

  it('uses a saved value that loads after start-up, unless the user changed something', async () => {
    jest.useFakeTimers();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const slowRead = () => {
      let finish: (raw: string | null) => void = () => undefined;
      jest.spyOn(kvStore, 'getItem').mockReturnValueOnce(new Promise<string | null>((resolve) => (finish = resolve)));
      return (raw: string) => finish(raw);
    };

    // Untouched: the late value replaces the default.
    const finishFirst = slowRead();
    const first = renderHook(() => usePersistentState('k', schema, { count: 0 }, identity));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3_000);
    });
    expect(first.result.current[2]).toBe(true);
    expect(first.result.current[0]).toEqual({ count: 0 });
    await act(async () => {
      finishFirst(JSON.stringify({ count: 9 }));
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(first.result.current[0]).toEqual({ count: 9 });
    first.unmount();

    // Touched: the user's change wins.
    const finishSecond = slowRead();
    const second = renderHook(() => usePersistentState('k2', schema, { count: 0 }, identity));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3_000);
    });
    act(() => second.result.current[1]({ count: 2 }));
    await act(async () => {
      finishSecond(JSON.stringify({ count: 9 }));
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(second.result.current[0]).toEqual({ count: 2 });
  });

  it('saves a pending change if it goes away before the pause ends', async () => {
    jest.useFakeTimers();
    const setItem = jest.spyOn(kvStore, 'setItem');
    const { result, unmount } = renderHook(() => usePersistentState('k', schema, { count: 0 }, identity));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    act(() => result.current[1]({ count: 4 }));
    unmount();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith('k', JSON.stringify({ count: 4 }));
  });

  it('saves after a short pause, once, with the latest value', async () => {
    jest.useFakeTimers();
    const setItem = jest.spyOn(kvStore, 'setItem');
    const { result } = renderHook(() => usePersistentState('k', schema, { count: 0 }, identity));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(result.current[2]).toBe(true);

    act(() => result.current[1]((v) => ({ count: v.count + 1 })));
    act(() => result.current[1]((v) => ({ count: v.count + 1 })));
    expect(setItem).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith('k', JSON.stringify({ count: 2 }));
  });

  it('does not save when nothing changed', async () => {
    jest.useFakeTimers();
    const setItem = jest.spyOn(kvStore, 'setItem');
    renderHook(() => usePersistentState('k', schema, { count: 0 }, identity));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    expect(setItem).not.toHaveBeenCalled();
  });

  it('saves right away when the app goes to the background', async () => {
    jest.useFakeTimers();
    let onChange: (state: AppStateStatus) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      onChange = listener as (state: AppStateStatus) => void;
      return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
    });
    const setItem = jest.spyOn(kvStore, 'setItem');
    const { result } = renderHook(() => usePersistentState('k', schema, { count: 0 }, identity));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    act(() => result.current[1]({ count: 5 }));
    act(() => onChange('background'));
    expect(setItem).toHaveBeenCalledWith('k', JSON.stringify({ count: 5 }));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});
