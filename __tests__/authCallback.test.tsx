// The sign-in redirect page. On phones +native-intent.tsx catches the link
// first (see screens/account.test.tsx); this page matters in a web browser,
// and as a fallback.

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, waitFor } from '@testing-library/react-native';
import type { ComponentType } from 'react';

import AuthCallbackScreen from '@/app/auth/callback';

import { fakeBackend, SAM } from '../test/fakeSupabase';
import { connectServer, resetServer } from '../test/helpers';

// Names starting with "mock" may be used inside jest.mock factories.
const mockReplace = jest.fn();
const mockParams: { current: Record<string, string | undefined> } = { current: {} };

jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => mockParams.current,
}));

const replace = mockReplace;

function loadScreen(popupResult: { type: string } = { type: 'failed' }): ComponentType {
  const browser = jest.requireMock<{ maybeCompleteAuthSession: jest.Mock }>('expo-web-browser');
  browser.maybeCompleteAuthSession.mockReturnValueOnce(popupResult);
  return AuthCallbackScreen;
}

describe('sign-in redirect page', () => {
  afterEach(() => {
    resetServer();
    mockParams.current = {};
    jest.restoreAllMocks();
  });

  it('finishes signing in, then shows Account', async () => {
    const backend = fakeBackend();
    connectServer(backend);
    mockParams.current = { code: 'good-page' };
    const Screen = loadScreen();
    const view = render(<Screen />);
    expect(view.getByText('Finishing sign-in…')).toBeTruthy();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/account'));
    expect(backend.auth.exchangeCodeForSession).toHaveBeenCalledWith('good-page');
    expect(backend.auth.userId).toBe(SAM.id);
  });

  it('passes a provider error along, and still moves on', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const backend = fakeBackend();
    connectServer(backend);
    mockParams.current = { error: 'server_error', error_description: 'Something & something' };
    const Screen = loadScreen();
    render(<Screen />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/account'));
    expect(backend.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('moves on without a server', async () => {
    const Screen = loadScreen();
    render(<Screen />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/account'));
  });

  it('in a browser popup, hands the link back and does nothing else', async () => {
    const backend = fakeBackend();
    connectServer(backend);
    mockParams.current = { code: 'good-popup' };
    const Screen = loadScreen({ type: 'success' });
    const view = render(<Screen />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    view.unmount();
    expect(replace).not.toHaveBeenCalled();
    expect(backend.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
