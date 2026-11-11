import crypto from 'node:crypto';
import { config } from '../config/env.js';

export function hashIP(ip: string): string {
  return crypto
    .createHash('sha256')
    .update(ip + config.ipHashSalt)
    .digest('hex');
}

export function hashString(str: string): string {
  return crypto
    .createHash('sha256')
    .update(str + config.ipHashSalt)
    .digest('hex');
}

export function generateRequestId(): string {
  return crypto.randomUUID();
}

