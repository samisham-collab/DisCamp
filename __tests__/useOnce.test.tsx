import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { useOnce } from '@/lib/useOnce';

describe('useOnce', () => {
  it('ignores a second press while the first is still going, then takes the next', async () => {
    const { result } = renderHook(() => useOnce());
    let finish: () => void = () => undefined;
    const task = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    result.current(task);
    result.current(task);
    expect(task).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    result.current(task);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('logs a task that fails unexpectedly, and lets the next one run', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useOnce());
    await act(async () => result.current(() => Promise.reject(new Error('boom'))));
    expect(error).toHaveBeenCalled();
    const next = jest.fn(async () => undefined);
    result.current(next);
    expect(next).toHaveBeenCalled();
    error.mockRestore();
  });
});
