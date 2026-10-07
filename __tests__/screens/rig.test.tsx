import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from 'expo-router/testing-library';

import { STORAGE_KEYS } from '@/config';
import { kvStore } from '@/lib/kvStore';

import { preset } from '../../test/fixtures';
import { renderApp } from '../../test/renderApp';

async function flushSave() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(500);
  });
}

describe('My Rig screen', () => {
  // Expo Router's renderRouter turns on fake timers; leave them on so the
  // testing library can unmount the app cleanly after each test.
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts on the default preset', async () => {
    await renderApp('/rig');
    expect(screen.getByText('Checking spots for')).toBeTruthy();
    expect(screen.getByText('9 in · 4WD · Rooftop tent')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Mid-size 4x4 + RTT' }).props.accessibilityState).toMatchObject({
      checked: true,
    });
  });

  it('switches to a big-rig preset and shows the length', async () => {
    await renderApp('/rig');
    fireEvent.press(screen.getByRole('radio', { name: '40 ft Class A' }));
    expect(await screen.findByText('7 in · 2WD · 40 ft big rig')).toBeTruthy();
    expect(screen.getByText('Rig length')).toBeTruthy();
  });

  it('turns into a custom rig when a value changes, and saves it', async () => {
    await renderApp('/rig');
    fireEvent.press(screen.getByLabelText('Increase Ground clearance'));
    expect(await screen.findByText('9.5 in · 4WD · Rooftop tent')).toBeTruthy();
    expect(screen.getByText('Custom rig: your changes are saved.')).toBeTruthy();

    await flushSave();
    const saved = JSON.parse((await kvStore.getItem(STORAGE_KEYS.rig)) ?? 'null') as { clearanceIn: number };
    expect(saved.clearanceIn).toBe(9.5);
  });

  it('supports screen-reader increment and decrement on the steppers', async () => {
    await renderApp('/rig');
    const stepper = screen.getByRole('adjustable', { name: 'Ground clearance' });
    fireEvent(stepper, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(await screen.findByText('8.5 in · 4WD · Rooftop tent')).toBeTruthy();
    expect(screen.getByRole('adjustable', { name: 'Ground clearance' }).props.accessibilityValue).toEqual({
      text: '8.5 inches',
    });
  });

  it('adds a trailer length when switching to a trailer', async () => {
    await renderApp('/rig');
    fireEvent.press(screen.getByRole('radio', { name: 'Trailer' }));
    expect(await screen.findByText('9 in · 4WD · 25 ft trailer')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Increase Trailer length'));
    expect(await screen.findByText('9 in · 4WD · 26 ft trailer')).toBeTruthy();
  });

  it('uses a fallback name while the name is blank', async () => {
    await renderApp('/rig');
    fireEvent.changeText(screen.getByLabelText('Rig name'), '   ');
    expect(await screen.findByText('My rig')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Rig name'), 'Blue Tacoma');
    expect(await screen.findByText('Blue Tacoma')).toBeTruthy();
  });

  it('loads the saved rig', async () => {
    await renderApp('/rig', { rig: { ...preset('Sedan'), name: 'Grandma car' } });
    expect(screen.getByText('Grandma car')).toBeTruthy();
    expect(screen.getByText('5.5 in · 2WD · Tent')).toBeTruthy();
  });

  it('ignores a corrupted saved rig and uses the default', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await kvStore.setItem(STORAGE_KEYS.rig, '{"name": 3}');
    await renderApp('/rig');
    expect(screen.getByText('9 in · 4WD · Rooftop tent')).toBeTruthy();
  });
});
