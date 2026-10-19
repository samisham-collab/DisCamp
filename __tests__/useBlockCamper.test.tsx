import { describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';

import { CleanupsProvider } from '@/data/cleanupsStore';
import { SpotsProvider } from '@/data/spots';
import { AuthProvider } from '@/lib/auth';
import { useBlockCamper } from '@/lib/useBlockCamper';

describe('useBlockCamper', () => {
  it('explains that blocking needs the DisCamp server', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { result } = renderHook(() => useBlockCamper(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProvider client={null}>
          <SpotsProvider client={null}>
            <CleanupsProvider>{children}</CleanupsProvider>
          </SpotsProvider>
        </AuthProvider>
      ),
    });
    result.current.block({ id: 'x', name: null }, '/');
    expect(alert).toHaveBeenCalledWith(
      "Blocking isn't available",
      'This version of DisCamp runs on its starter spots only.',
    );
    alert.mockRestore();
  });
});
