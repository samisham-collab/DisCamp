import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import type { ReactNode } from 'react';
import { Alert, AppState, Linking, type AppStateStatus } from 'react-native';

import { LocationProvider, useLocation } from '@/lib/location';

import { activeWatches, emitFix, emitWatchError, GOODLAND } from '../test/mocks/expoLocation';

type Permission = Awaited<ReturnType<typeof Location.getForegroundPermissionsAsync>>;
const permission = (status: 'granted' | 'denied' | 'undetermined', canAskAgain = true) =>
  ({ status, canAskAgain, granted: status === 'granted' }) as Permission;

const wrapper = ({ children }: { children: ReactNode }) => <LocationProvider>{children}</LocationProvider>;

async function setup() {
  const hook = renderHook(() => useLocation(), { wrapper });
  await waitFor(() => expect(hook.result.current.status).not.toBe('checking'));
  return hook;
}

describe('location', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('does not ask for permission on launch', async () => {
    const { result } = await setup();
    expect(result.current.status).toBe('undetermined');
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(result.current.coords).toBeNull();
  });

  it('uses location on launch when it was already allowed', async () => {
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValueOnce(permission('granted'));
    jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValueOnce({ coords: GOODLAND } as never);
    const { result } = await setup();
    await waitFor(() => expect(result.current.coords).toEqual(GOODLAND));
    expect(result.current.status).toBe('granted');
  });

  it('asks, then finds the camper', async () => {
    const { result } = await setup();
    let found: unknown;
    await act(async () => {
      found = await result.current.locate();
    });
    expect(found).toEqual(GOODLAND);
    expect(result.current.coords).toEqual(GOODLAND);
    expect(result.current.status).toBe('granted');
    expect(result.current.locating).toBe(false);
  });

  it('gets a fresh, exact fix for cleanup photos, with how sure it is', async () => {
    const { result } = await setup();
    jest
      .mocked(Location.getCurrentPositionAsync)
      .mockResolvedValueOnce({ coords: { ...GOODLAND, accuracy: 9.5 } } as never);
    let found: unknown;
    await act(async () => {
      found = await result.current.locate({ fresh: true });
    });
    expect(found).toEqual({ ...GOODLAND, accuracy: 9.5 });
    expect(Location.getLastKnownPositionAsync).toHaveBeenLastCalledWith({ maxAge: 30_000, requiredAccuracy: 50 });
    expect(Location.getCurrentPositionAsync).toHaveBeenLastCalledWith({ accuracy: Location.Accuracy.High });
  });

  it('sends the camper to Settings after a permanent denial', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const { result } = await setup();
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValueOnce(permission('denied', false));
    await act(async () => {
      await expect(result.current.locate()).resolves.toBeNull();
    });
    expect(result.current.status).toBe('denied');
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Location is off for DisCamp', expect.any(String), expect.any(Array));

    const buttons = alert.mock.calls[0]?.[2] ?? [];
    buttons.find((b) => b.text === 'Open Settings')?.onPress?.();
    expect(openSettings).toHaveBeenCalled();
  });

  it('respects a "don\'t allow" without nagging', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValueOnce(permission('denied', true));
    const { result } = await setup();
    await act(async () => {
      await expect(result.current.locate()).resolves.toBeNull();
    });
    expect(result.current.status).toBe('denied');
    expect(alert).not.toHaveBeenCalled();
  });

  it("doesn't nag right after the camper says no in the system prompt (iOS)", async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    // iOS reports canAskAgain: false as soon as the camper denies.
    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValueOnce(permission('denied', false));
    const { result } = await setup();
    await act(async () => {
      await expect(result.current.locate()).resolves.toBeNull();
    });
    expect(alert).not.toHaveBeenCalled();

    // Tapping again can't show the prompt any more, so now point to Settings.
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValueOnce(permission('denied', false));
    await act(async () => {
      await expect(result.current.locate()).resolves.toBeNull();
    });
    expect(alert).toHaveBeenCalledWith('Location is off for DisCamp', expect.any(String), expect.any(Array));
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('stops waiting when the permission check never answers', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { result } = await setup();
    jest.useFakeTimers();
    jest.mocked(Location.getForegroundPermissionsAsync).mockReturnValueOnce(new Promise(() => undefined));
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.locate();
    });
    expect(result.current.locating).toBe(true);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });
    await expect(pending).resolves.toBeNull();
    expect(result.current.locating).toBe(false);
    expect(alert).toHaveBeenCalledWith("Couldn't find your location", 'Try again in a moment.');
  });

  it('moves on to a fresh fix when the last known position never answers', async () => {
    const { result } = await setup();
    jest.useFakeTimers();
    jest.mocked(Location.getLastKnownPositionAsync).mockReturnValueOnce(new Promise(() => undefined));
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.locate();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });
    await expect(pending).resolves.toEqual(GOODLAND);
  });

  it('explains when Location Services are off', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValueOnce(false);
    const { result } = await setup();
    await act(async () => {
      await expect(result.current.locate()).resolves.toBeNull();
    });
    expect(alert).toHaveBeenCalledWith('Location Services are off', expect.any(String));
  });

  it('explains Location Services are off when iPhone reports DisCamp as denied because of it', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { result } = await setup();
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValueOnce(permission('denied', false));
    jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValueOnce(false);
    await act(async () => {
      await expect(result.current.locate()).resolves.toBeNull();
    });
    expect(alert).toHaveBeenCalledWith('Location Services are off', expect.any(String));
    expect(alert).not.toHaveBeenCalledWith('Location is off for DisCamp', expect.any(String), expect.any(Array));
  });

  it('gives up on a position that never comes', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { result } = await setup();
    jest.useFakeTimers();
    jest
      .mocked(Location.getCurrentPositionAsync)
      .mockReturnValueOnce(new Promise(() => undefined) as ReturnType<typeof Location.getCurrentPositionAsync>);
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.locate();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(15_000);
    });
    await expect(pending).resolves.toBeNull();
    expect(alert).toHaveBeenCalledWith("Couldn't find your location", expect.any(String));
  });

  it('reports unexpected errors', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { result } = await setup();
    jest.mocked(Location.getForegroundPermissionsAsync).mockRejectedValueOnce(new Error('native crash'));
    await act(async () => {
      await expect(result.current.locate()).resolves.toBeNull();
    });
    expect(alert).toHaveBeenCalledWith("Couldn't find your location", 'Try again in a moment.');
  });

  it('shares one request between quick double taps', async () => {
    const { result } = await setup();
    await act(async () => {
      const [a, b] = [result.current.locate(), result.current.locate()];
      expect(a).toBe(b);
      await a;
    });
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('survives a failure while checking on launch', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.mocked(Location.getForegroundPermissionsAsync).mockRejectedValueOnce(new Error('no module'));
    const { result } = await setup();
    expect(result.current.status).toBe('undetermined');
  });

  it('stays quiet when the position is unavailable on launch', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValueOnce(permission('granted'));
    jest.mocked(Location.getLastKnownPositionAsync).mockRejectedValueOnce(new Error('Location services are disabled'));
    jest.mocked(Location.getCurrentPositionAsync).mockRejectedValueOnce(new Error('Location services are disabled'));
    const { result } = await setup();
    await waitFor(() => expect(info).toHaveBeenCalledTimes(2));
    // Permission is still granted (the blue dot can show later); just no fix yet.
    expect(result.current.status).toBe('granted');
    expect(result.current.coords).toBeNull();
    expect(alert).not.toHaveBeenCalled();
  });

  it('treats a failed GPS fix as "no fix", not as an app error', async () => {
    // What the iPhone Simulator does when no location is set (Features > Location > None).
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest
      .mocked(Location.getCurrentPositionAsync)
      .mockRejectedValueOnce(
        new Error("Calling the 'getCurrentPositionAsync' function has failed: kCLErrorDomain error 0"),
      );
    const { result } = await setup();
    await act(async () => {
      await expect(result.current.locate()).resolves.toBeNull();
    });
    // No console.error (the test setup fails on one), just the friendly explanation.
    expect(alert).toHaveBeenCalledWith(
      "Couldn't find your location",
      'Try again in a moment, ideally with a clear view of the sky.',
    );
    expect(result.current.locating).toBe(false);
  });

  it('keeps a fresh fix over a slower launch lookup', async () => {
    const fresh = { latitude: 39.2, longitude: -101.8 };
    let finishLaunch: (value: { coords: typeof GOODLAND }) => void = () => undefined;
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValueOnce(permission('granted'));
    jest
      .mocked(Location.getLastKnownPositionAsync)
      .mockReturnValueOnce(new Promise((resolve) => (finishLaunch = resolve)) as never)
      .mockResolvedValueOnce({ coords: fresh } as never);
    const { result } = await setup();
    await act(async () => {
      await result.current.locate();
    });
    expect(result.current.coords).toEqual(fresh);
    await act(async () => {
      finishLaunch({ coords: GOODLAND });
      await Promise.resolve();
    });
    expect(result.current.coords).toEqual(fresh);
  });
  it('notices when the camper allowed only an approximate location', async () => {
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValueOnce({
      ...permission('granted'),
      android: { accuracy: 'coarse' },
    } as Permission);
    const { result } = await setup();
    await waitFor(() => expect(result.current.approximate).toBe(true));
  });

  it('works distances out again when the camper comes back after a while', async () => {
    let onChange: (state: AppStateStatus) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      onChange = listener as (state: AppStateStatus) => void;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValueOnce(permission('granted'));
    jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValueOnce({ coords: GOODLAND } as never);
    const { result } = await setup();
    await waitFor(() => expect(result.current.coords).toEqual(GOODLAND));

    // Back within 5 minutes: nothing to do.
    await act(async () => onChange('active'));
    expect(Location.getLastKnownPositionAsync).toHaveBeenCalledTimes(1);

    // Back after a 200-mile drive.
    const away = { latitude: 41.1, longitude: -104.8 };
    jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValueOnce({ coords: away } as never);
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60_000);
    await act(async () => onChange('background'));
    await act(async () => onChange('active'));
    await waitFor(() => expect(result.current.coords).toEqual(away));
  });

  it('listens for a better fix, and settles for the best one after the wait', async () => {
    const { result } = await setup();
    jest
      .mocked(Location.getCurrentPositionAsync)
      .mockResolvedValue({ coords: { ...GOODLAND, accuracy: 300 } } as never);
    const heard: (number | null | undefined)[] = [];
    let found: Promise<unknown> = Promise.resolve(null);
    jest.useFakeTimers();
    await act(async () => {
      found = result.current.refine(75, 30_000, (fix) => heard.push(fix.accuracy));
      await Promise.resolve();
    });
    await waitFor(() => expect(activeWatches()).toBe(1));
    act(() => emitFix({ ...GOODLAND, accuracy: 120 }));
    act(() => emitFix({ ...GOODLAND, accuracy: 140 }));
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await found;
    });
    expect(await found).toEqual({ ...GOODLAND, accuracy: 120 });
    expect(heard).toEqual([300, 120, 140]);
    expect(activeWatches()).toBe(0);
    expect(result.current.locating).toBe(false);
    expect(result.current.coords).toEqual({ ...GOODLAND, accuracy: 120 });
  });

  it('answers at once when the first fix is good, or when location is off', async () => {
    const { result } = await setup();
    jest
      .mocked(Location.getCurrentPositionAsync)
      .mockResolvedValueOnce({ coords: { ...GOODLAND, accuracy: 10 } } as never);
    let found: unknown;
    await act(async () => {
      found = await result.current.refine(75, 30_000);
    });
    expect(found).toEqual({ ...GOODLAND, accuracy: 10 });
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();

    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValueOnce(permission('denied', true));
    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValueOnce(permission('denied', false) as never);
    await act(async () => {
      found = await result.current.refine(75, 30_000);
    });
    expect(found).toBeNull();
  });

  it('stops at the first good fix, riding out GPS hiccups, and settles when it can’t listen', async () => {
    const { result } = await setup();
    jest
      .mocked(Location.getCurrentPositionAsync)
      .mockResolvedValue({ coords: { ...GOODLAND, accuracy: 300 } } as never);
    let found: Promise<unknown> = Promise.resolve(null);
    await act(async () => {
      found = result.current.refine(75, 30_000);
      await Promise.resolve();
    });
    await waitFor(() => expect(activeWatches()).toBe(1));
    // A hiccup is noted, not an error.
    act(() => emitWatchError('kCLErrorLocationUnknown'));
    act(() => emitFix({ ...GOODLAND, accuracy: 30 }));
    expect(await act(async () => found)).toEqual({ ...GOODLAND, accuracy: 30 });
    expect(activeWatches()).toBe(0);

    // The phone won't let DisCamp keep listening: the first fix it had.
    jest.mocked(Location.watchPositionAsync).mockRejectedValueOnce(new Error('not allowed'));
    let second: unknown;
    await act(async () => {
      second = await result.current.refine(75, 30_000);
    });
    expect(second).toEqual({ ...GOODLAND, accuracy: 300 });
  });
});
