import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { z } from 'zod';

import { kvStore } from '@/lib/kvStore';
import { readJson, writeJson } from '@/lib/storage';

const schema = z.object({ n: z.number() });

describe('storage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('returns null when nothing is saved', async () => {
    await expect(readJson('missing', schema)).resolves.toBeNull();
  });

  it('round-trips a valid value', async () => {
    await expect(writeJson('k', { n: 1 })).resolves.toBe(true);
    await expect(readJson('k', schema)).resolves.toEqual({ n: 1 });
  });

  it('ignores saved data that is not JSON', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await kvStore.setItem('k', '{not json');
    await expect(readJson('k', schema)).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('ignores saved data in the wrong shape', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await kvStore.setItem('k', JSON.stringify({ n: 'one' }));
    await expect(readJson('k', schema)).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('survives a storage failure on read and on write', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(kvStore, 'getItem').mockRejectedValueOnce(new Error('disk full'));
    jest.spyOn(kvStore, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    await expect(readJson('k', schema)).resolves.toBeNull();
    await expect(writeJson('k', { n: 1 })).resolves.toBe(false);
    expect(error).toHaveBeenCalledTimes(2);
  });

  it('hands over a saved value that arrives after the timeout', async () => {
    jest.useFakeTimers();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let finish: (raw: string | null) => void = () => undefined;
    jest.spyOn(kvStore, 'getItem').mockReturnValueOnce(new Promise<string | null>((resolve) => (finish = resolve)));
    const onLateValue = jest.fn();
    const result = readJson('k', schema, { onLateValue });
    await jest.advanceTimersByTimeAsync(3_000);
    await expect(result).resolves.toBeNull();
    expect(onLateValue).not.toHaveBeenCalled();

    finish(JSON.stringify({ n: 4 }));
    await jest.advanceTimersByTimeAsync(0);
    expect(onLateValue).toHaveBeenCalledWith({ n: 4 });
  });

  it('gives up on a read that hangs', async () => {
    jest.useFakeTimers();
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(kvStore, 'getItem').mockReturnValueOnce(new Promise<string | null>(() => undefined));
    const result = readJson('k', schema);
    await jest.advanceTimersByTimeAsync(3_000);
    await expect(result).resolves.toBeNull();
    expect(error).toHaveBeenCalled();
  });
});
