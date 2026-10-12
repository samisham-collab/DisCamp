// The help card with a support email set (the screen tests run without one).

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { Alert, Linking } from 'react-native';

import { HelpCard } from '@/components/HelpCard';

jest.mock('@/config', () => ({
  ...jest.requireActual<Record<string, unknown>>('@/config'),
  SUPPORT_EMAIL: 'help@discamp.test',
}));

describe('HelpCard', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows the support email, opens mail and copies the address', async () => {
    jest.useFakeTimers();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<HelpCard />);
    expect(screen.getByText('help@discamp.test')).toBeTruthy();

    fireEvent.press(screen.getByText('Email us'));
    expect(open).toHaveBeenCalledWith('mailto:help@discamp.test?subject=DisCamp');

    await act(async () => fireEvent.press(screen.getByText('Copy address')));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('help@discamp.test');
    expect(screen.getByText('Copied')).toBeTruthy();
    act(() => jest.advanceTimersByTime(2000));
    expect(screen.getByText('Copy address')).toBeTruthy();
  });

  it('stays put when copying fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(new Error('denied'));
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    render(<HelpCard />);
    await act(async () => fireEvent.press(screen.getByText('Copy address')));
    expect(screen.queryByText('Copied')).toBeNull();
  });
});
