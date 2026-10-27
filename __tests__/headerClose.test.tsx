import { describe, expect, it } from '@jest/globals';
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { HeaderClose } from '@/components/HeaderClose';

const routes = {
  index: () => <Text>Home</Text>,
  sheet: () => <HeaderClose />,
};

describe('HeaderClose', () => {
  it('goes back to the screen underneath', async () => {
    const app = renderRouter(routes, { initialUrl: '/' });
    act(() => router.push('/sheet'));
    fireEvent.press(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });

  it('goes home when opened straight from a link', async () => {
    const app = renderRouter(routes, { initialUrl: '/sheet' });
    fireEvent.press(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(screen.getByText('Home')).toBeTruthy();
  });
});
