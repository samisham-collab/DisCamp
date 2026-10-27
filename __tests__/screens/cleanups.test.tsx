// Cleanups end to end in the real app: the Cleanups tab, posting one,
// cleaning one up, the moderator's review, Embers on Account, and the map.

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { Linking, RefreshControl } from 'react-native';

import Constants from 'expo-constants';

import { inExpoGo } from '@/lib/expoGo';
import * as PhotoPicker from '@/lib/photoPicker';
import * as Links from '@/lib/links';

import { ALEX, fakeBackend, NEWBIE, SAM, type FakeBackend, type FakeUser } from '../../test/fakeSupabase';
import { makeRow } from '../../test/fixtures';
import { connectServer, resetServer, spyOnAlerts } from '../../test/helpers';
import { activeWatches, emitFix } from '../../test/mocks/expoLocation';
import { renderApp } from '../../test/renderApp';

// Pinned to Smoky Gardens only: see test/mocks/seedSpots.ts.
jest.mock('@/data/seedSpots', () => jest.requireActual('../../test/mocks/seedSpots'));
// Expo Go, like the real default; one test pretends to be a store build.
jest.mock('@/lib/expoGo', () => ({ inExpoGo: jest.fn(() => true) }));

/** Row spot (makeRow) is at 39.19, -101.76. */
const AT_ROW_SPOT = { latitude: 39.19, longitude: -101.76 };
/** About 55 m north of it. */
const NEAR_ROW_SPOT = { latitude: 39.1905, longitude: -101.76 };
/** About 2.2 km north: too far from it for a cleanup's after photo. */
const AWAY = { latitude: 39.21, longitude: -101.76 };

const taskId = (n: number) => `00000000-0000-4000-8000-0000000c1e${String(n).padStart(2, '0')}`;
const DAY = 86_400_000;

function server(user: FakeUser | null = SAM) {
  const backend = fakeBackend([makeRow()]);
  backend.auth.setUser(ALEX);
  backend.auth.setUser(user);
  connectServer(backend);
  return backend;
}

/** A cleanup already posted by `by`, near Row spot. */
function cleanupBy(backend: FakeBackend, by: FakeUser, n: number, extra: Record<string, unknown> = {}) {
  const id = taskId(n);
  const path = `${by.id}/${id}.jpg`;
  backend.files.set(path, { owner: by.id, bytes: 4 });
  backend.cleanups.set(id, {
    id,
    ...AT_ROW_SPOT,
    kind: 'litter',
    size: 'medium',
    note: null,
    status: 'open',
    before_path: path,
    created_by: by.id,
    created_at: new Date(Date.now() - 2 * DAY).toISOString(),
    spot_id: 'row-spot',
    hidden: false,
    done_at: null,
    ...extra,
  });
  return id;
}

/** Where the phone says the camper is, for the next location requests. */
function standAt(at: { latitude: number; longitude: number }, accuracy = 8, { approximate = false } = {}) {
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({
    status: 'granted',
    canAskAgain: true,
    granted: true,
    // Precise Location off: the phone only knows the town.
    ...(approximate ? { ios: { scope: 'whenInUse', accuracy: 'reduced' } } : {}),
  } as never);
  jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({ coords: { ...at, accuracy } } as never);
}

/** Pulls the screen's list down to refresh it. */
async function pullToRefresh() {
  const control = screen.UNSAFE_getByType(RefreshControl);
  await act(async () => {
    (control.props as { onRefresh: () => void }).onRefresh();
    await jest.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({ coords: AT_ROW_SPOT } as never);
});

afterEach(() => {
  resetServer();
  jest.restoreAllMocks();
});

describe('Cleanups tab', () => {
  it('lists cleanups to do (nearest first), waiting for review and done', async () => {
    const backend = server();
    standAt(AT_ROW_SPOT);
    cleanupBy(backend, ALEX, 1, { latitude: 39.3, longitude: -101.76, size: 'small' });
    cleanupBy(backend, ALEX, 2, { kind: 'fire_ring' });
    cleanupBy(backend, ALEX, 3, { status: 'review', kind: 'dumping' });
    cleanupBy(backend, ALEX, 4, { status: 'done', kind: 'other', done_at: new Date().toISOString() });
    cleanupBy(backend, ALEX, 5, { status: 'done', done_at: new Date(Date.now() - 40 * DAY).toISOString() });
    await renderApp('/cleanups');
    expect(await screen.findByText('Leave it better')).toBeTruthy();
    const toDo = await screen.findByText('To clean up');
    expect(toDo).toBeTruthy();
    const rows = screen
      .getAllByRole('button')
      .filter((b) => /Needs cleaning up/.test(b.props.accessibilityLabel ?? ''));
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual([
      expect.stringContaining('Trash in a fire ring · medium'),
      expect.stringContaining('Litter · small'),
    ]);
    expect(rows[0]?.props.accessibilityLabel).toContain('Near Row spot');
    expect(screen.getByText('Waiting for review')).toBeTruthy();
    expect(screen.getByText('Dumped trash or junk · medium')).toBeTruthy();
    expect(screen.getByText('Cleaned up lately')).toBeTruthy();
    expect(screen.getByText('Other mess · medium')).toBeTruthy();
    // Cleaned up more than 30 days ago: not listed.
    expect(screen.getAllByText(/· medium$/)).toHaveLength(3);
  });

  it('says when there are none, and sends a signed-out camper to sign in to post', async () => {
    server(null);
    const app = await renderApp('/cleanups');
    expect(await screen.findByText('No cleanups yet')).toBeTruthy();
    fireEvent.press(screen.getByText('Post a cleanup'));
    await waitFor(() => expect(app.getPathname()).toBe('/sign-in'));
  });

  it('shows what went wrong loading, and tries again', async () => {
    const backend = server();
    let fail = true;
    backend.intercept = (query) =>
      fail && query.table === 'cleanup_tasks_api'
        ? Promise.resolve({ data: null, error: { message: 'Network request failed' } })
        : undefined;
    cleanupBy(backend, ALEX, 1);
    await renderApp('/cleanups');
    expect(await screen.findByText("You're offline. Try again when you have signal.")).toBeTruthy();
    fail = false;
    fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Litter · medium')).toBeTruthy();
  });

  it('refreshes when pulled down', async () => {
    const backend = server();
    await renderApp('/cleanups');
    expect(await screen.findByText('No cleanups yet')).toBeTruthy();
    cleanupBy(backend, ALEX, 1);
    await pullToRefresh();
    expect(await screen.findByText('Litter · medium')).toBeTruthy();
  });

  it('loads again on coming back to the tab only once the list is a few minutes old', async () => {
    const backend = server();
    await renderApp('/cleanups');
    expect(await screen.findByText('No cleanups yet')).toBeTruthy();
    const loads = () => backend.queries.filter((q) => q.table === 'cleanup_tasks_api').length;
    const before = loads();
    cleanupBy(backend, ALEX, 1);
    act(() => router.navigate('/'));
    act(() => router.navigate('/cleanups'));
    expect(await screen.findByText('No cleanups yet')).toBeTruthy();
    expect(loads()).toBe(before);

    jest.setSystemTime(Date.now() + 3 * 60_000);
    act(() => router.navigate('/'));
    act(() => router.navigate('/cleanups'));
    expect(await screen.findByText('Litter · medium')).toBeTruthy();
  });

  it('is turned off without a server', async () => {
    resetServer();
    await renderApp('/cleanups');
    expect(await screen.findByText("Cleanups aren't available")).toBeTruthy();
  });
});

describe('Posting a cleanup', () => {
  it('takes the before photo, pins it where the camper stands, links the spot nearby, and posts it', async () => {
    const backend = server();
    standAt(NEAR_ROW_SPOT, 12);
    const app = await renderApp('/cleanup/new');
    expect(await screen.findByText('Post a cleanup', { exact: false })).toBeTruthy();
    // Nothing to post without a photo.
    expect(screen.getByText('Post the cleanup')).toBeTruthy();

    fireEvent.press(screen.getByText('Take the before photo'));
    expect(await screen.findByText('Pinned where you are (within about 12 m). Near Row spot.')).toBeTruthy();
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Large: 5 or more bags, or bulky items'));
    fireEvent.press(screen.getByText('Trash in a fire ring'));
    fireEvent.changeText(screen.getByLabelText('Note'), '  Behind the fire ring ');
    fireEvent.press(screen.getByText('Post the cleanup'));

    await waitFor(() => expect(app.getPathname()).toMatch(/^\/cleanup\/[0-9a-f-]{36}$/));
    const [posted] = [...backend.cleanups.values()];
    expect(posted).toMatchObject({
      kind: 'fire_ring',
      size: 'large',
      note: 'Behind the fire ring',
      spot_id: 'row-spot',
      created_by: SAM.id,
      latitude: 39.1905,
      longitude: -101.76,
    });
    expect(backend.files.has(String(posted?.before_path))).toBe(true);
    expect(await screen.findByText('Trash in a fire ring · large')).toBeTruthy();
    expect(screen.getByText(/Cleaned it up yourself\?/)).toBeTruthy();
  });

  it('asks before throwing away a photo that wasn’t posted', async () => {
    server();
    standAt(NEAR_ROW_SPOT, 12);
    const alerts = spyOnAlerts();
    const app = await renderApp('/cleanups');
    act(() => router.push('/cleanup/new'));
    fireEvent.press(await screen.findByText('Take the before photo'));
    expect(await screen.findByText(/Pinned where you are/)).toBeTruthy();
    fireEvent.press(screen.getByText('Cancel'));
    expect(alerts.lastTitle()).toBe('Discard this cleanup?');
    act(() => alerts.press('Keep editing'));
    expect(screen.getByText(/Pinned where you are/)).toBeTruthy();
    fireEvent.press(screen.getByText('Cancel'));
    act(() => alerts.press('Discard'));
    await waitFor(() => expect(app.getPathname()).toBe('/cleanups'));
  });

  it('won’t pin a cleanup to an approximate location, and points to Precise Location', async () => {
    const backend = server();
    const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    standAt(NEAR_ROW_SPOT, 2600, { approximate: true });
    await renderApp('/cleanup/new');
    fireEvent.press(await screen.findByText('Take the before photo'));
    expect(
      await screen.findByText(
        'Your phone shares only an approximate location with DisCamp (within about 1.6 mi). Turn on Precise Location for DisCamp in Settings, then tap Try again.',
      ),
    ).toBeTruthy();
    // No point listening for a better fix: it can't come.
    expect(activeWatches()).toBe(0);
    fireEvent.press(screen.getByText('Settings'));
    expect(settings).toHaveBeenCalled();
    fireEvent.press(screen.getByText('Post the cleanup'));
    expect(backend.cleanups.size).toBe(0);

    // Precise Location on in Settings: Try again, no new photo needed.
    standAt(NEAR_ROW_SPOT, 20);
    fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Pinned where you are (within about 20 m). Near Row spot.')).toBeTruthy();
  });

  it('keeps listening when the first fix is weak, and pins the first good one', async () => {
    const backend = server();
    standAt(NEAR_ROW_SPOT, 300);
    await renderApp('/cleanup/new');
    fireEvent.press(await screen.findByText('Take the before photo'));
    expect(await screen.findByText('Finding your location (within about 300 m so far)…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Post the cleanup' }).props.accessibilityHint).toBe(
      'Waiting for your location.',
    );
    await waitFor(() => expect(activeWatches()).toBe(1));
    act(() => emitFix({ ...NEAR_ROW_SPOT, accuracy: 120 }));
    expect(screen.getByText('Finding your location (within about 120 m so far)…')).toBeTruthy();
    act(() => emitFix({ ...NEAR_ROW_SPOT, accuracy: 30 }));
    expect(await screen.findByText('Pinned where you are (within about 30 m). Near Row spot.')).toBeTruthy();
    expect(activeWatches()).toBe(0);
    fireEvent.press(screen.getByText('Post the cleanup'));
    await waitFor(() => expect(backend.cleanups.size).toBe(1));
  });

  it('says when GPS stays weak, and tries again without a new photo', async () => {
    server();
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    standAt(NEAR_ROW_SPOT, 300);
    jest.mocked(Location.watchPositionAsync).mockRejectedValueOnce(new Error('No GPS'));
    await renderApp('/cleanup/new');
    fireEvent.press(await screen.findByText('Take the before photo'));
    expect(
      await screen.findByText(/^GPS is weak here: DisCamp got within about 300 m and needs 75 m to pin the cleanup\./),
    ).toBeTruthy();
    standAt(NEAR_ROW_SPOT, 20);
    fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Pinned where you are (within about 20 m). Near Row spot.')).toBeTruthy();
  });

  it('opened from a spot far away, posts where the camper stands without linking it', async () => {
    const backend = server();
    standAt({ latitude: 39.5, longitude: -101.76 });
    await renderApp('/cleanup/new?spot=row-spot');
    fireEvent.press(await screen.findByText('Take the before photo'));
    expect(await screen.findByText(/You're 21 mi from Row spot, so this cleanup won't be linked to it\./)).toBeTruthy();
    fireEvent.press(screen.getByText('Post the cleanup'));
    await waitFor(() => expect(backend.cleanups.size).toBe(1));
    expect([...backend.cleanups.values()][0]?.spot_id).toBeNull();
  });

  it('says why the server refused it, and removes the photo it uploaded', async () => {
    const backend = server();
    standAt(AT_ROW_SPOT);
    cleanupBy(backend, ALEX, 1);
    await renderApp('/cleanup/new');
    fireEvent.press(await screen.findByText('Take the before photo'));
    await screen.findByText(/Pinned where you are/);
    fireEvent.press(screen.getByText('Post the cleanup'));
    expect(
      await screen.findByText(
        'Someone already posted a cleanup within 30 m of here. Find it in Cleanups and clean that one up.',
      ),
    ).toBeTruthy();
    expect(backend.cleanups.size).toBe(1);
    expect(backend.storageCalls.at(-1)?.op).toBe('remove');
    // A new photo gets a new name.
    const first = backend.storageCalls.at(-1)?.paths[0];
    standAt({ latitude: 39.25, longitude: -101.76 });
    fireEvent.press(screen.getByText('Retake the photo'));
    expect(await screen.findByText('Pinned where you are (within about 8 m).')).toBeTruthy();
    fireEvent.press(screen.getByText('Post the cleanup'));
    await waitFor(() => expect(backend.cleanups.size).toBe(2));
    expect(backend.storageCalls.filter((c) => c.op === 'upload').at(-1)?.paths[0]).not.toBe(first);
  });

  it('asks for location when the phone has none, and explains a camera that is off', async () => {
    server();
    const alerts = spyOnAlerts();
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({
      status: 'granted',
      canAskAgain: true,
      granted: true,
    } as never);
    jest.mocked(Location.getCurrentPositionAsync).mockRejectedValue(new Error('No fix'));
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    await renderApp('/cleanup/new');
    fireEvent.press(await screen.findByText('Take the before photo'));
    expect(
      await screen.findByText(
        "DisCamp couldn't find your location, and needs it to pin the cleanup. Check that location is on for DisCamp, then tap Try again.",
      ),
    ).toBeTruthy();
    expect(alerts.lastTitle()).toBe("Couldn't find your location");
    standAt(AT_ROW_SPOT);
    fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText(/Pinned where you are/)).toBeTruthy();

    jest
      .mocked(ImagePicker.requestCameraPermissionsAsync)
      .mockResolvedValueOnce({ granted: false, status: 'denied', canAskAgain: false } as never);
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    fireEvent.press(screen.getByText('Retake the photo'));
    await waitFor(() => expect(alerts.lastTitle()).toBe('Camera is off for DisCamp'));
    await act(async () => alerts.press('Open Settings'));
    expect(openSettings).toHaveBeenCalled();
  });

  it('asks a signed-out camper to sign in, and a new one to agree to the rules', async () => {
    const backend = server(null);
    await renderApp('/cleanup/new');
    expect(await screen.findByText('Sign in first')).toBeTruthy();
    act(() => backend.auth.setUser(NEWBIE));
    expect(await screen.findByText('Before you post')).toBeTruthy();
  });

  it('starts from a spot page, which lists the spot’s cleanups', async () => {
    const backend = server();
    cleanupBy(backend, ALEX, 1);
    cleanupBy(backend, ALEX, 2, { status: 'done', kind: 'other' });
    const app = await renderApp('/spot/row-spot');
    expect(await screen.findByText('Litter · medium')).toBeTruthy();
    expect(screen.queryByText('Other mess · medium')).toBeNull();
    fireEvent.press(screen.getByText('Post a cleanup here'));
    await waitFor(() => expect(app.getPathname()).toBe('/cleanup/new'));
  });
});

describe('Cleaning one up', () => {
  it('sends an after photo and a haul shot from near the pin, for review', async () => {
    const backend = server();
    const alerts = spyOnAlerts();
    standAt(NEAR_ROW_SPOT, 9);
    const id = cleanupBy(backend, ALEX, 1, { note: 'Cans everywhere' });
    const app = await renderApp(`/cleanup/${id}`);
    expect(await screen.findByText('Litter · medium')).toBeTruthy();
    expect(screen.getByText("Needs cleaning up. Pack it out and earn 100 Embers once it's approved.")).toBeTruthy();
    expect(screen.getByText('Cans everywhere')).toBeTruthy();
    expect(screen.getByText('Near Row spot')).toBeTruthy();

    fireEvent.press(screen.getByText('I cleaned it up'));
    await waitFor(() => expect(app.getPathname()).toBe(`/cleanup/send/${id}`));
    expect(screen.getByText('You cleaned it up')).toBeTruthy();
    fireEvent.press(screen.getByText('Take the after photo'));
    expect(await screen.findByText("You're about 56 m from the pin. Good.")).toBeTruthy();
    fireEvent.press(screen.getByText('Take the haul shot'));
    expect(await screen.findByText('Retake the haul shot')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Note for the moderator'), '3 bags');
    fireEvent.press(screen.getByText('Send for review'));

    await waitFor(() => expect(alerts.lastTitle()).toBe('Sent for review'));
    expect(alerts.alert.mock.calls.at(-1)?.[1]).toContain('your 100 Embers post');
    expect(backend.completions[0]).toMatchObject({
      task_id: id,
      camper_id: SAM.id,
      status: 'pending',
      note: '3 bags',
      accuracy_m: 9,
    });
    expect(backend.cleanups.get(id)?.status).toBe('review');
    await waitFor(() => expect(app.getPathname()).toBe(`/cleanup/${id}`));
    expect(await screen.findByText(/Your cleanup is waiting for review/)).toBeTruthy();
    expect(screen.queryByText('I cleaned it up')).toBeNull();
  });

  it('offers notifications after sending, in a store build', async () => {
    jest.mocked(inExpoGo).mockReturnValue(false);
    const config = Constants.expoConfig as { extra?: unknown };
    const saved = config.extra;
    config.extra = { eas: { projectId: 'project-1234' } };
    try {
      const backend = server();
      const alerts = spyOnAlerts();
      standAt(NEAR_ROW_SPOT, 9);
      const id = cleanupBy(backend, ALEX, 1);
      await renderApp(`/cleanup/send/${id}`);
      fireEvent.press(await screen.findByText('Take the after photo'));
      fireEvent.press(await screen.findByText('Take the haul shot'));
      expect(await screen.findByText('Retake the haul shot')).toBeTruthy();
      fireEvent.press(screen.getByText('Send for review'));
      await waitFor(() => expect(alerts.lastTitle()).toBe('Sent for review'));
      expect(alerts.alert.mock.calls.at(-1)?.[1]).toMatch(/Want a notification when it’s reviewed\?$/);
      await act(async () => alerts.press('Notify me'));
      await waitFor(() => expect(backend.pushTokens.get('ExponentPushToken[test-phone-1]')).toBe(SAM.id));
    } finally {
      config.extra = saved;
      jest.mocked(inExpoGo).mockReturnValue(true);
    }
  });

  it('won’t send from too far away', async () => {
    const backend = server();
    standAt(AWAY);
    const id = cleanupBy(backend, ALEX, 1);
    await renderApp(`/cleanup/send/${id}`);
    fireEvent.press(await screen.findByText('Take the after photo'));
    expect(
      await screen.findByText(
        "You're 1.4 mi from the cleanup's pin. Go to it and retake the after photo (within 150 m).",
      ),
    ).toBeTruthy();
    fireEvent.press(screen.getByText('Take the haul shot'));
    expect(await screen.findByText('Retake the haul shot')).toBeTruthy();
    fireEvent.press(screen.getByText('Send for review'));
    expect(backend.completions).toHaveLength(0);

    // Walk over and retake it.
    standAt(AT_ROW_SPOT);
    fireEvent.press(screen.getByText('Retake the after photo'));
    expect(await screen.findByText("You're about 0 m from the pin. Good.")).toBeTruthy();
  });

  it('won’t check an after photo against an approximate location, and gives close calls in meters', async () => {
    const backend = server();
    standAt(AT_ROW_SPOT, 2600, { approximate: true });
    const id = cleanupBy(backend, ALEX, 1);
    await renderApp(`/cleanup/send/${id}`);
    fireEvent.press(await screen.findByText('Take the after photo'));
    expect(await screen.findByText(/approximate location with DisCamp \(within about 1\.6 mi\)/)).toBeTruthy();
    fireEvent.press(screen.getByText('Take the haul shot'));
    expect(await screen.findByText('Retake the haul shot')).toBeTruthy();
    fireEvent.press(screen.getByText('Send for review'));
    expect(backend.completions).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Send for review' }).props.accessibilityHint).toBe(
      'Needs your location within 75 m.',
    );

    // Precise, but just outside 150 m.
    standAt({ latitude: AT_ROW_SPOT.latitude + 0.0015, longitude: AT_ROW_SPOT.longitude }, 8);
    fireEvent.press(screen.getByText('Retake the after photo'));
    expect(
      await screen.findByText(/^You're 1\d\d m from the cleanup's pin\. Go to it and retake the after photo/),
    ).toBeTruthy();
  });

  it('drops a cleanup that’s gone from the server off the list', async () => {
    const backend = server();
    const id = cleanupBy(backend, ALEX, 1);
    await renderApp('/cleanups');
    expect(await screen.findAllByText('Litter · medium')).toHaveLength(1);
    backend.cleanups.delete(id);
    act(() => router.push(`/cleanup/${id}`));
    expect(await screen.findByText('Cleanup not found')).toBeTruthy();
    fireEvent.press(screen.getByText('Back to Cleanups'));
    expect(await screen.findByText('Leave it better')).toBeTruthy();
    expect(screen.queryByText('Litter · medium')).toBeNull();
  });

  it('needs a signed-in camper and a cleanup that’s there', async () => {
    const backend = server(null);
    const id = cleanupBy(backend, ALEX, 1);
    await renderApp(`/cleanup/send/${id}`);
    expect(await screen.findByText('Sign in first')).toBeTruthy();
    act(() => backend.auth.setUser(SAM));
    await renderApp(`/cleanup/send/${taskId(9)}`);
    expect(await screen.findByText('Cleanup not found')).toBeTruthy();
  });

  it('tries again when cleanups couldn’t load, instead of a dead end', async () => {
    const backend = server();
    const id = cleanupBy(backend, ALEX, 1);
    backend.intercept = (query) =>
      query.table === 'cleanup_tasks_api'
        ? Promise.resolve({ data: null, error: { message: 'Network request failed' } })
        : undefined;
    await renderApp(`/cleanup/send/${id}`);
    expect(await screen.findByText("Couldn't load the cleanup")).toBeTruthy();
    backend.intercept = null;
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('You cleaned it up')).toBeTruthy();
  });

  it('asks for location for the after photo, and explains a camera that fails', async () => {
    const backend = server();
    const alerts = spyOnAlerts();
    const id = cleanupBy(backend, ALEX, 1);
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({
      status: 'granted',
      canAskAgain: true,
      granted: true,
    } as never);
    jest.mocked(Location.getCurrentPositionAsync).mockRejectedValue(new Error('No fix'));
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    await renderApp(`/cleanup/send/${id}`);
    fireEvent.press(await screen.findByText('Take the after photo'));
    expect(
      await screen.findByText(
        "DisCamp couldn't find your location, and needs it to check you're at the cleanup. Check that location is on for DisCamp, then tap Try again.",
      ),
    ).toBeTruthy();
    standAt(AT_ROW_SPOT);
    fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText("You're about 0 m from the pin. Good.")).toBeTruthy();

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(PhotoPicker, 'pickPhoto').mockRejectedValueOnce(new Error('Camera busy'));
    fireEvent.press(screen.getByText('Take the haul shot'));
    await waitFor(() => expect(alerts.lastTitle()).toBe("Couldn't take the photo"));
    expect(warn).toHaveBeenCalled();
  });

  it('shows why the server refused it', async () => {
    const backend = server();
    standAt(AT_ROW_SPOT);
    const id = cleanupBy(backend, ALEX, 1);
    await renderApp(`/cleanup/send/${id}`);
    fireEvent.press(await screen.findByText('Take the after photo'));
    await screen.findByText(/from the pin\. Good\./);
    fireEvent.press(screen.getByText('Take the haul shot'));
    expect(await screen.findByText('Retake the haul shot')).toBeTruthy();
    // Someone else got there first.
    backend.cleanups.set(id, { ...backend.cleanups.get(id), status: 'review' });
    fireEvent.press(screen.getByText('Send for review'));
    expect(
      await screen.findByText("Someone's cleanup of this is waiting for review. Check back in a day or two."),
    ).toBeTruthy();
    // Both photos it uploaded are removed.
    expect(backend.storageCalls.at(-1)).toMatchObject({ op: 'remove' });
    // The after photo and haul shot, each with its preview.
    expect(backend.storageCalls.at(-1)?.paths).toHaveLength(4);
  });

  it('shows a cleanup sent back, with one more try, then none', async () => {
    const backend = server();
    const id = cleanupBy(backend, ALEX, 1);
    backend.completions.push({
      id: taskId(50),
      task_id: id,
      camper_id: SAM.id,
      status: 'rejected',
      review_note: 'Still bags by the fire ring',
      created_at: new Date().toISOString(),
    });
    await renderApp(`/cleanup/${id}`);
    expect(
      await screen.findByText(/Sent back: Still bags by the fire ring\. You can send it once more\./),
    ).toBeTruthy();
    expect(screen.getByText('I cleaned it up')).toBeTruthy();
  });

  it('shows who cleaned it up, with their photos', async () => {
    const backend = server();
    const id = cleanupBy(backend, SAM, 1, { status: 'done', done_at: '2026-10-12T18:00:00Z' });
    backend.completions.push({
      id: taskId(51),
      task_id: id,
      camper_id: ALEX.id,
      after_path: `${ALEX.id}/${taskId(51)}.jpg`,
      haul_path: `${ALEX.id}/${taskId(52)}.jpg`,
      status: 'approved',
      created_at: new Date().toISOString(),
    });
    await renderApp(`/cleanup/${id}`);
    expect(await screen.findByText('Cleaned up by Alex on Oct 12, 2026. Thank you!')).toBeTruthy();
    expect(screen.getByLabelText('After photo')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('What they packed out'));
    expect(await screen.findByTestId('photo-full-size')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Close'));
    expect(screen.queryByText('I cleaned it up')).toBeNull();
    // Posted by you: nothing to report.
    expect(screen.queryByText('Report this cleanup')).toBeNull();
  });

  it('lets the camper who posted it delete it, while nobody has acted on it', async () => {
    const backend = server();
    const alerts = spyOnAlerts();
    const id = cleanupBy(backend, SAM, 1);
    const app = await renderApp(`/cleanup/${id}`);
    fireEvent.press(await screen.findByText('Delete this cleanup'));
    await act(async () => alerts.press('Delete'));
    await waitFor(() => expect(backend.cleanups.has(id)).toBe(false));
    expect(backend.storageCalls.at(-1)).toMatchObject({
      op: 'remove',
      paths: [`${SAM.id}/${id}.jpg`, `${SAM.id}/${id}.preview.jpg`],
    });
    await waitFor(() => expect(app.getPathname()).not.toBe(`/cleanup/${id}`));
  });

  it('says when it can’t be deleted', async () => {
    const backend = server();
    const alerts = spyOnAlerts();
    const id = cleanupBy(backend, SAM, 1);
    backend.flags.push({ reporter: ALEX.id, taskId: id, reason: 'fake', status: 'open' });
    await renderApp(`/cleanup/${id}`);
    fireEvent.press(await screen.findByText('Delete this cleanup'));
    await act(async () => alerts.press('Delete'));
    await waitFor(() => expect(alerts.lastTitle()).toBe("Couldn't delete the cleanup"));
    expect(alerts.alert.mock.calls.at(-1)?.[1]).toMatch(/reported it/);
  });

  it('reports someone else’s cleanup', async () => {
    const backend = server();
    const id = cleanupBy(backend, ALEX, 1);
    const app = await renderApp(`/cleanup/${id}`);
    fireEvent.press(await screen.findByText('Report this cleanup'));
    await waitFor(() => expect(app.getPathname()).toBe(`/report/task/${id}`));
    expect(screen.getByText('Report this cleanup')).toBeTruthy();
    fireEvent.press(screen.getByText("Not real, or there's no trash here"));
    fireEvent.press(screen.getByText('Send report'));
    expect(await screen.findByText('Thanks for reporting')).toBeTruthy();
    expect(backend.flags.at(-1)).toMatchObject({ reporter: SAM.id, taskId: id, reason: 'fake' });
  });

  it('shows a visitor the cleanup, with directions and the spot it’s near', async () => {
    const backend = server(null);
    const id = cleanupBy(backend, ALEX, 1);
    const directions = jest.spyOn(Links, 'openDirectionsTo').mockResolvedValue(true);
    const app = await renderApp(`/cleanup/${id}`);
    fireEvent.press(await screen.findByText('Directions'));
    expect(directions).toHaveBeenCalledWith(expect.objectContaining({ id }), 'Cleanup');
    fireEvent.press(screen.getByText('I cleaned it up'));
    await waitFor(() => expect(app.getPathname()).toBe('/sign-in'));
  });

  it('opens the spot it’s near', async () => {
    const backend = server();
    const id = cleanupBy(backend, ALEX, 1);
    const app = await renderApp(`/cleanup/${id}`);
    fireEvent.press(await screen.findByText('Near Row spot'));
    await waitFor(() => expect(app.getPathname()).toBe('/spot/row-spot'));
  });

  it('says when it can’t load the cleanup, and still works without the camper’s tries', async () => {
    const backend = server();
    const id = cleanupBy(backend, ALEX, 1);
    backend.intercept = (query) =>
      query.table === 'cleanup_completions'
        ? Promise.resolve({ data: null, error: { message: 'Network request failed' } })
        : undefined;
    await renderApp(`/cleanup/${id}`);
    expect(await screen.findByText('I cleaned it up')).toBeTruthy();

    backend.intercept = (query) =>
      query.table === 'cleanup_tasks_api'
        ? Promise.resolve({ data: null, error: { message: 'Network request failed' } })
        : undefined;
    cleanupBy(backend, ALEX, 2);
    await renderApp(`/cleanup/${taskId(2)}`);
    expect(await screen.findByText("Couldn't load the cleanup")).toBeTruthy();
    // Back in signal: Try again loads it.
    backend.intercept = null;
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('I cleaned it up')).toBeTruthy();
  });

  it('says when a cleanup isn’t there', async () => {
    server();
    await renderApp(`/cleanup/${taskId(99)}`);
    expect(await screen.findByText('Cleanup not found')).toBeTruthy();
    fireEvent.press(screen.getByText('Back to Cleanups'));
    expect(await screen.findByText('Leave it better')).toBeTruthy();
  });
});

describe('Review', () => {
  function waiting(backend: FakeBackend) {
    backend.ensureProfile(NEWBIE);
    const id = cleanupBy(backend, ALEX, 1, { size: 'small' });
    backend.completions.push({
      id: taskId(60),
      task_id: id,
      camper_id: NEWBIE.id,
      after_path: `${NEWBIE.id}/${taskId(60)}.jpg`,
      haul_path: `${NEWBIE.id}/${taskId(61)}.jpg`,
      ...NEAR_ROW_SPOT,
      accuracy_m: 7,
      note: 'Two bags',
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    backend.cleanups.set(id, { ...backend.cleanups.get(id), status: 'review' });
    return id;
  }

  it('is only for moderators', async () => {
    server();
    await renderApp('/review');
    expect(await screen.findByText('For moderators')).toBeTruthy();
  });

  it('says when it can’t check, and tries again', async () => {
    const backend = server();
    backend.moderators.add(SAM.id);
    waiting(backend);
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    let offline = true;
    backend.intercept = (query) =>
      offline && query.table === 'rpc:am_moderator'
        ? Promise.resolve({ data: null, error: { message: 'Network request failed' } })
        : undefined;
    await renderApp('/review');
    expect(await screen.findByText("Couldn't check")).toBeTruthy();
    offline = false;
    fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Litter · small near Row spot')).toBeTruthy();
  });

  it('approves a cleanup at the size the moderator sees, and Embers post', async () => {
    const backend = server();
    backend.moderators.add(SAM.id);
    const id = waiting(backend);
    await renderApp('/review');
    expect(await screen.findByText('Litter · small near Row spot')).toBeTruthy();
    expect(screen.getByText('Robin')).toBeTruthy();
    expect(screen.getByText('56 m from the pin (phone sure to 7 m)')).toBeTruthy();
    expect(screen.getByText('From Robin: Two bags')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Medium'));
    expect(screen.getByText('Medium earns 100 Embers (posted as small).')).toBeTruthy();
    fireEvent.press(screen.getByText('Approve: 100 Embers'));
    expect(await screen.findByText('All caught up')).toBeTruthy();
    expect(backend.cleanups.get(id)?.status).toBe('done');
    expect(backend.embers.map((e) => [e.camper_id, e.reason, e.amount])).toEqual([
      [NEWBIE.id, 'cleanup', 100],
      [ALEX.id, 'cleanup_reported', 10],
    ]);
  });

  it('sends one back with a reason the camper reads', async () => {
    const backend = server();
    backend.moderators.add(SAM.id);
    const id = waiting(backend);
    await renderApp('/review');
    fireEvent.press(await screen.findByText('Send back'));
    fireEvent.press(screen.getAllByText('Send back').at(-1) as never);
    expect(await screen.findByText('Choose why.')).toBeTruthy();
    fireEvent.press(screen.getByText('Something else'));
    fireEvent.press(screen.getAllByText('Send back').at(-1) as never);
    expect(await screen.findByText('Say what to fix.')).toBeTruthy();
    fireEvent.press(screen.getByText("The site doesn't look cleaned up yet"));
    fireEvent.changeText(screen.getByLabelText('More for the camper'), 'Bags left by the gate.');
    fireEvent.press(screen.getAllByText('Send back').at(-1) as never);
    expect(await screen.findByText('All caught up')).toBeTruthy();
    expect(backend.completions[0]).toMatchObject({
      status: 'rejected',
      review_note: "The site doesn't look cleaned up yet. Bags left by the gate.",
    });
    expect(backend.cleanups.get(id)?.status).toBe('open');
  });

  it('drops one another moderator already reviewed', async () => {
    const backend = server();
    const alerts = spyOnAlerts();
    backend.moderators.add(SAM.id);
    waiting(backend);
    await renderApp('/review');
    await screen.findByText('Litter · small near Row spot');
    backend.completions[0] = { ...backend.completions[0], status: 'approved' };
    fireEvent.press(screen.getByText('Approve: 50 Embers'));
    await waitFor(() => expect(alerts.lastTitle()).toBe('Already reviewed'));
    expect(await screen.findByText('All caught up')).toBeTruthy();
  });

  it('shows what went wrong, and tries again', async () => {
    const backend = server();
    backend.moderators.add(SAM.id);
    waiting(backend);
    let fail = true;
    backend.intercept = (query) =>
      fail && query.table === 'rpc:cleanup_review_queue'
        ? Promise.resolve({ data: null, error: { message: 'Network request failed' } })
        : undefined;
    await renderApp('/review');
    expect(await screen.findByText("You're offline. Try again when you have signal.")).toBeTruthy();
    fail = false;
    fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Litter · small near Row spot')).toBeTruthy();

    // Refusals other than "already reviewed" stay on the card.
    backend.intercept = (query) =>
      query.table === 'rpc:approve_cleanup'
        ? Promise.resolve({ data: null, error: { message: 'Failed to fetch' } })
        : undefined;
    fireEvent.press(screen.getByText('Approve: 50 Embers'));
    expect(await screen.findByText("You're offline. Try again when you have signal.")).toBeTruthy();

    // Changed your mind about sending it back.
    fireEvent.press(screen.getByText('Send back'));
    fireEvent.press(screen.getByText('Cancel'));
    expect(screen.getByText('Approve: 50 Embers')).toBeTruthy();

    backend.intercept = null;
    await pullToRefresh();
    expect(screen.getByText('Litter · small near Row spot')).toBeTruthy();
  });

  it('opens from Account for moderators', async () => {
    const backend = server();
    backend.moderators.add(SAM.id);
    const app = await renderApp('/account');
    fireEvent.press(await screen.findByText('Review cleanups'));
    await waitFor(() => expect(app.getPathname()).toBe('/review'));
  });
});

describe('Embers on Account', () => {
  it('shows the total, rank, progress and what earned them', async () => {
    const backend = server();
    const at = new Date().toISOString();
    backend.embers.push(
      {
        id: 1,
        camper_id: SAM.id,
        reason: 'cleanup',
        amount: 150,
        full_amount: 150,
        spot_id: 'row-spot',
        spot_name: 'Row spot',
        created_at: at,
      },
      {
        id: 2,
        camper_id: SAM.id,
        reason: 'still_good',
        amount: 10,
        full_amount: 10,
        spot_id: null,
        spot_name: null,
        created_at: at,
      },
      {
        id: 3,
        camper_id: SAM.id,
        reason: 'photo',
        amount: 0,
        full_amount: 5,
        spot_id: null,
        spot_name: null,
        created_at: at,
      },
      {
        id: 4,
        camper_id: SAM.id,
        reason: 'taken_back',
        amount: -10,
        full_amount: -10,
        spot_id: null,
        spot_name: null,
        created_at: at,
      },
      {
        id: 5,
        camper_id: ALEX.id,
        reason: 'cleanup',
        amount: 150,
        full_amount: 150,
        spot_id: null,
        spot_name: null,
        created_at: at,
      },
    );
    await renderApp('/account');
    expect(await screen.findByText('150 Embers')).toBeTruthy();
    expect(screen.getByText('Tenderfoot')).toBeTruthy();
    expect(screen.getByText('100 Embers to Scout · Today: 160 of 300')).toBeTruthy();
    const recent = screen.getByLabelText('Recent Embers');
    expect(within(recent).getByText('Cleanup approved · Row spot')).toBeTruthy();
    expect(within(recent).getByText('+150')).toBeTruthy();
    expect(within(recent).getByText('−10')).toBeTruthy();
    expect(within(recent).getByText(/\(daily limit reached\)/)).toBeTruthy();

    fireEvent.press(screen.getByText('How to earn Embers'));
    expect(screen.getByText('Clean up a site (approved)')).toBeTruthy();
    expect(screen.getByText('50 / 100 / 150')).toBeTruthy();
    // Not a moderator: no Review.
    expect(screen.queryByText('Review cleanups')).toBeNull();
  });

  it('starts at zero', async () => {
    server();
    await renderApp('/account');
    expect(await screen.findByText('0 Embers')).toBeTruthy();
    expect(screen.getByText(/No Embers yet/)).toBeTruthy();
  });

  it('says when they can’t load', async () => {
    const backend = server();
    backend.intercept = (query) =>
      query.table === 'rpc:my_embers'
        ? Promise.resolve({ data: null, error: { message: 'Network request failed' } })
        : undefined;
    await renderApp('/account');
    expect(await screen.findByText("You're offline. Try again when you have signal.")).toBeTruthy();
  });
});

describe('On the map', () => {
  it('shows cleanups still to do as pins that open them', async () => {
    const backend = server();
    const id = cleanupBy(backend, ALEX, 1);
    cleanupBy(backend, ALEX, 2, { status: 'done', latitude: 39.3 });
    const app = await renderApp('/');
    const pin = await screen.findByTestId(`cleanup-marker-${id}`);
    expect(pin.props.accessibilityLabel).toBe('Cleanup: Litter · medium');
    expect(screen.queryByTestId(`cleanup-marker-${taskId(2)}`)).toBeNull();
    fireEvent.press(pin);
    await waitFor(() => expect(app.getPathname()).toBe(`/cleanup/${id}`));
  });
});
