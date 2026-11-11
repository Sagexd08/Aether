import { pgRateLimit, ipKey, sessionKey } from '../services/rateLimiter.js';

export const generalApiRateLimiter = pgRateLimit({ name: 'api_ip_min', limit: 100, windowSec: 60, keyFor: ipKey });

export const adminRateLimiter = pgRateLimit({ name: 'admin_ip_min', limit: 30, windowSec: 60, keyFor: ipKey });

export const authRateLimiter = pgRateLimit({ name: 'auth_ip_min', limit: 10, windowSec: 60, keyFor: ipKey });

export const promptEnhancementRateLimiter = pgRateLimit({ name: 'enhance_ip_min', limit: 20, windowSec: 60, keyFor: ipKey });

export const generateIpLimiter = pgRateLimit({ name: 'gen_ip_min', limit: 10, windowSec: 60, keyFor: ipKey, failClosed: true });
export const generateSessionLimiter = pgRateLimit({ name: 'gen_session_min', limit: 6, windowSec: 60, keyFor: sessionKey, failClosed: true });
