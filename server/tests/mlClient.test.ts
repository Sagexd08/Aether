import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Client = typeof import('../src/services/mlClient.js');

const httpError = (status: number) => new AxiosError('failed', String(status), undefined, undefined, { status } as never);
const networkError = () => new AxiosError('connection refused', 'ECONNREFUSED');

let ml: Client;

async function settle<T>(promise: Promise<T>) {
  const outcome = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error })
  );
  await vi.runAllTimersAsync();
  return outcome;
}

async function openBreaker() {
  for (let i = 0; i < 5; i += 1) await settle(ml.callMl(() => Promise.reject(httpError(503))));
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  ml = await import('../src/services/mlClient.js');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('mlClient circuit breaker', () => {
  it('returns the value and stays closed on success', async () => {
    await expect(ml.callMl(async () => 'ok')).resolves.toBe('ok');
    expect(ml.breakerStatus()).toEqual({ state: 'closed', consecutive_failures: 0 });
  });

  it('retries transient failures up to 2 times', async () => {
    const fn = vi.fn().mockRejectedValueOnce(networkError()).mockRejectedValueOnce(httpError(502)).mockResolvedValue('ok');
    const result = await settle(ml.callMl(fn));
    expect(result).toEqual({ value: 'ok' });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('opens after 5 failed calls and short-circuits', async () => {
    await openBreaker();
    expect(ml.breakerStatus().state).toBe('open');
    const fn = vi.fn();
    const result = await settle(ml.callMl(fn));
    expect(result).toMatchObject({ error: expect.any(ml.MlUnavailableError) });
    expect(fn).not.toHaveBeenCalled();
    expect(ml.breakerRetryAfter()).toBeGreaterThan(0);
  });

  it('half-opens after the cool-down and closes on a successful probe', async () => {
    await openBreaker();
    vi.setSystemTime(Date.now() + 31_000);
    await expect(ml.callMl(async () => 'probe')).resolves.toBe('probe');
    expect(ml.breakerStatus().state).toBe('closed');
  });

  it('re-opens when the half-open probe fails', async () => {
    await openBreaker();
    vi.setSystemTime(Date.now() + 31_000);
    await settle(ml.callMl(() => Promise.reject(httpError(503))));
    expect(ml.breakerStatus().state).toBe('open');
  });

  it('does not count 4xx responses as failures', async () => {
    for (let i = 0; i < 10; i += 1) await settle(ml.callMl(() => Promise.reject(httpError(400))));
    expect(ml.breakerStatus()).toEqual({ state: 'closed', consecutive_failures: 0 });
  });

  it('counts a non-transient 500 as a failure without retrying', async () => {
    const fn = vi.fn().mockRejectedValue(httpError(500));
    await settle(ml.callMl(fn));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(ml.breakerStatus().consecutive_failures).toBe(1);
  });
});
