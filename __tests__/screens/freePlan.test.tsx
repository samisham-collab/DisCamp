// Staying on Supabase's free plan, on screen: posting screens say when new
// photos or posts are paused, lists show small previews, and moderators see
// how full the plan is on the Review tab.

import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { PHOTOS_PAUSED_MESSAGE, POSTING_PAUSED_MESSAGE } from '@/data/appStatus';

import { ALEX, fakeBackend, SAM, type FakeUser } from '../../test/fakeSupabase';
import { makeRow } from '../../test/fixtures';
import { connectServer, spyOnAlerts } from '../../test/helpers';
import { renderApp } from '../../test/renderApp';

// Pinned to Smoky Gardens only: see test/mocks/seedSpots.ts.
jest.mock('@/data/seedSpots', () => jest.requireActual('../../test/mocks/seedSpots'));

const ALEX_SPOT = makeRow({
  id: 'alex-spot',
  name: 'Alex Hollow',
  created_by: ALEX.id,
  added_by: 'Alex',
  created_at: '2026-10-07T12:00:00+00:00',
  verified: false,
  report_count: 0,
});

const MB = 1024 * 1024;

function server(user: FakeUser | null = SAM) {
  const backend = fakeBackend([makeRow(), ALEX_SPOT]);
  backend.auth.setUser(ALEX);
  backend.auth.setUser(user);
  connectServer(backend);
  return backend;
}

/** Every image on screen showing this address. */
const imagesOf = (uri: string) =>
  screen.UNSAFE_root.findAll(
    (node) => typeof node.type === 'string' && (node.props.source as { uri?: string } | undefined)?.uri === uri,
  );

describe('When DisCamp is near its free plan limits', () => {
  it('says new photos are paused, and explains a refused one', async () => {
    const backend = server();
    backend.paused.photos = true;
    const alerts = spyOnAlerts();
    await renderApp('/spot/alex-spot');
    expect(await screen.findByText(PHOTOS_PAUSED_MESSAGE)).toBeTruthy();

    // Storage refuses the file, and the database says why.
    fireEvent.press(screen.getByText('Add a photo'));
    await act(async () => alerts.press('Take a photo'));
    await waitFor(() => expect(alerts.lastTitle()).toBe("Couldn't add the photo"));
    expect(alerts.alert.mock.calls.at(-1)?.[1]).toBe(PHOTOS_PAUSED_MESSAGE);
    expect(backend.photos.size).toBe(0);
    expect(backend.files.size).toBe(0);
  });

  it('says new spots are paused', async () => {
    const backend = server();
    backend.paused.posting = true;
    await renderApp('/spot/new');
    expect(await screen.findByText(POSTING_PAUSED_MESSAGE)).toBeTruthy();
  });

  it('says new check-ins are paused', async () => {
    const backend = server();
    backend.paused.posting = true;
    await renderApp('/checkin/alex-spot');
    expect(await screen.findByText(POSTING_PAUSED_MESSAGE)).toBeTruthy();
  });

  it("doesn't pause check-ins when only photos are paused", async () => {
    const backend = server();
    backend.paused.photos = true;
    await renderApp('/checkin/alex-spot');
    await waitFor(() => expect(backend.queries.some((q) => q.table === 'rpc:app_status')).toBe(true));
    expect(screen.queryByText(POSTING_PAUSED_MESSAGE)).toBeNull();
    expect(screen.queryByText(PHOTOS_PAUSED_MESSAGE)).toBeNull();
  });

  it('says so before a cleanup, which needs photos', async () => {
    const backend = server();
    backend.paused.photos = true;
    await renderApp('/cleanup/new');
    expect(await screen.findByText(PHOTOS_PAUSED_MESSAGE)).toBeTruthy();
  });
});

describe('Photo previews', () => {
  it('shows the small preview in the strip, and the full photo if there is none', async () => {
    const backend = server();
    const path = `${ALEX.id}/00000000-0000-4000-8000-00000000f001.jpg`;
    backend.files.set(path, { owner: ALEX.id, bytes: 4 });
    backend.photos.set('00000000-0000-4000-8000-00000000f001', {
      id: '00000000-0000-4000-8000-00000000f001',
      spot_id: 'alex-spot',
      path,
      width: 1280,
      height: 960,
      created_by: ALEX.id,
      created_at: '2026-10-08T12:00:00Z',
      hidden: false,
    });
    await renderApp('/spot/alex-spot');
    await screen.findByLabelText('Photo 1 of 1, by Alex');
    const base = 'https://fake.supabase.test/storage/v1/object/public/spot-photos/';
    const [preview] = imagesOf(`${base}${path.replace('.jpg', '.preview.jpg')}`);
    expect(preview).toBeTruthy();
    // An older photo without a preview: the strip falls back to the photo.
    await act(async () => preview?.props.onError?.());
    expect(imagesOf(`${base}${path}`)).toHaveLength(1);
  });
});

describe('Free plan card (moderators)', () => {
  it('shows how full the plan is', async () => {
    const backend = server();
    backend.moderators.add(SAM.id);
    await renderApp('/review');
    expect(await screen.findByText('Photos and files: 140 MB of 1 GB (13%)')).toBeTruthy();
    expect(screen.getByText('Database: 30 MB of 500 MB (6%)')).toBeTruthy();
    expect(screen.getByText('Well inside the free plan.')).toBeTruthy();
    expect(screen.getByText(/312 spots · 340 photos · 12 cleanups · 23 campers/)).toBeTruthy();
  });

  it('warns when it gets full, and shows growth over the month', async () => {
    const backend = server();
    backend.moderators.add(SAM.id);
    backend.usage = {
      ...backend.usage,
      storage_bytes: 800 * MB,
      level: 'warn',
      month_ago: { day: '2026-09-21', database_bytes: 20 * MB, storage_bytes: 600 * MB },
    };
    await renderApp('/review');
    expect(await screen.findByText('Getting full. Plan ahead: see MODERATION.md, "Free plan".')).toBeTruthy();
    expect(screen.getByText(/photos and files grew 200 MB, the database 10 MB/)).toBeTruthy();
  });

  it('says when new photos are paused', async () => {
    const backend = server();
    backend.moderators.add(SAM.id);
    backend.usage = { ...backend.usage, storage_bytes: 950 * MB, photos_paused: true, level: 'paused' };
    await renderApp('/review');
    expect(await screen.findByText(/New photos and cleanups are paused/)).toBeTruthy();
  });

  it('says when all new posts are paused', async () => {
    const backend = server();
    backend.moderators.add(SAM.id);
    backend.usage = { ...backend.usage, photos_paused: true, posting_paused: true, level: 'paused' };
    await renderApp('/review');
    expect(await screen.findByText(/New spots, photos and check-ins are paused \(by hand/)).toBeTruthy();
  });

  it("says when it couldn't read the numbers", async () => {
    const backend = server();
    backend.moderators.add(SAM.id);
    backend.intercept = (query) =>
      query.table === 'rpc:free_plan_usage'
        ? Promise.resolve({ data: null, error: { message: 'Network request failed' } })
        : undefined;
    await renderApp('/review');
    expect(await screen.findByText("Couldn't read usage. Pull down to try again.")).toBeTruthy();
  });
});
