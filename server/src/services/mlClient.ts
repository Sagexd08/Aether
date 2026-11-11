import axios from 'axios';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

export class MlUnavailableError extends Error {
  constructor(public readonly retryAfterSec: number) {
    super('Image model is temporarily unavailable');
    this.name = 'MlUnavailableError';
  }
}

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 500;
const FAILURE_THRESHOLD = 5;
const OPEN_MS = 30_000;

export const mlHttp = axios.create({
  baseURL: config.mlServiceUrl,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'X-Internal-Token': config.mlInternalToken },
});

type BreakerState = 'closed' | 'open' | 'half-open';
let state: BreakerState = 'closed';
let consecutiveFailures = 0;
let openedAt = 0;

export function breakerStatus(): { state: BreakerState; consecutive_failures: number } {
  return { state, consecutive_failures: consecutiveFailures };
}

export function breakerRetryAfter(): number {
  if (state !== 'open') return 0;
  return Math.max(0, Math.ceil((openedAt + OPEN_MS - Date.now()) / 1000));
}

function isTransient(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (!error.response) return true;
  return [502, 503, 504].includes(error.response.status);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function onSuccess(): void {
  consecutiveFailures = 0;
  state = 'closed';
}

function onFailure(): void {
  consecutiveFailures += 1;
  if (state === 'half-open' || consecutiveFailures >= FAILURE_THRESHOLD) {
    state = 'open';
    openedAt = Date.now();
    logger.warn({ consecutiveFailures }, 'ml_service circuit opened');
  }
}

export async function callMl<T>(fn: () => Promise<T>): Promise<T> {
  if (state === 'open') {
    const wait = breakerRetryAfter();
    if (wait > 0) throw new MlUnavailableError(wait);
    state = 'half-open';
  }
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await fn();
      onSuccess();
      return result;
    } catch (error) {
      if (axios.isCancel(error)) throw error;
      if (!isTransient(error)) {
        if (axios.isAxiosError(error) && error.response && error.response.status < 500) onSuccess();
        else onFailure();
        throw error;
      }
      if (attempt >= MAX_RETRIES || state === 'half-open') {
        onFailure();
        throw error;
      }
      await sleep(BACKOFF_BASE_MS * 2 ** attempt + Math.random() * 250);
    }
  }
}
