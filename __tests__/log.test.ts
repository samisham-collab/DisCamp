import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { describeError, log } from '@/lib/log';

describe('log', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('describes any kind of error as a string', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
    expect(describeError(new TypeError())).toBe('TypeError');
    expect(describeError('plain text')).toBe('plain text');
    expect(describeError({ code: 42 })).toBe('{"code":42}');
    expect(describeError(null)).toBe('null');
    expect(describeError(undefined)).toBe('undefined');
    expect(describeError(() => undefined)).toEqual(expect.any(String));
    expect(describeError(Symbol('odd'))).toBe('Symbol(odd)');
    expect(describeError(10n)).toBe('10');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeError(circular)).toBe('[object Object]');
  });

  it('prefixes messages and includes context', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    log.warn('Careful');
    log.warn('Careful', { id: 'x' });
    log.error('Broke', new Error('boom'), { id: 'y' });
    log.error('Broke without details');
    expect(warn).toHaveBeenNthCalledWith(1, '[DisCamp] Careful');
    expect(warn).toHaveBeenNthCalledWith(2, '[DisCamp] Careful', { id: 'x' });
    expect(error).toHaveBeenNthCalledWith(1, '[DisCamp] Broke', { id: 'y', error: 'boom' });
    expect(error).toHaveBeenNthCalledWith(2, '[DisCamp] Broke without details');
  });
});
