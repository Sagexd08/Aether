import { config } from '../config/env.js';
import { fail } from '../utils/httpError.js';
import { Router, Request, Response } from 'express';
import { generalApiRateLimiter, authRateLimiter } from '../middleware/rateLimit.js';
import { attachSession } from '../middleware/session.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, preferencesSchema, registerSchema, loginSchema } from '../middleware/validate.js';
import { consume, refund, sendRejection } from '../services/rateLimiter.js';
import { createHash } from 'crypto';
import {
  createUser,
  authenticateUser,
  generateAuthTokens,
  verifyRefreshToken,
  rotateRefreshToken,
  linkSession,
  unlinkSession,
  revokeRefreshToken,
  revokeAllUserTokens,
  getUserById,
} from '../services/auth.js';
import { db } from '../database/db.js';

const router = Router();
const LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_SEC = 15 * 60;

router.post('/register', generalApiRateLimiter, authRateLimiter, attachSession, validateBody(registerSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await createUser(email, password);
    const tokens = await generateAuthTokens(user.id, user.email, user.plan);
    await linkSession(req.sessionId, user.id);

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
      },
      accessToken: tokens.accessToken,
    });
  } catch (error: any) {
    if (error.message === 'Email already registered') return res.status(409).json({ error: error.message });
    req.log.error({ err: error }, 'register failed');
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', generalApiRateLimiter, authRateLimiter, attachSession, validateBody(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const attemptKey = `login:${(req as any).ipHash}:${createHash('sha256').update(email).digest('hex').slice(0, 24)}`;
    const attempt = await consume(attemptKey, LOGIN_ATTEMPTS, LOGIN_WINDOW_SEC);
    if (!attempt.allowed) return sendRejection(res, 429, 'Too many sign-in attempts. Try again later.', attempt.retryAfter);

    const user = await authenticateUser(email, password);
    await refund(attemptKey, LOGIN_WINDOW_SEC);
    const tokens = await generateAuthTokens(user.id, user.email, user.plan);
    await linkSession(req.sessionId, user.id);

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
      },
      accessToken: tokens.accessToken,
    });
  } catch (error: any) {
    if (error.message !== 'Invalid email or password') req.log.error({ err: error }, 'login failed');
    res.status(401).json({ error: 'Invalid email or password' });
  }
});

router.post('/refresh', generalApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const payload = typeof refreshToken === 'string' ? verifyRefreshToken(refreshToken) : null;
    if (!payload) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const userId = await rotateRefreshToken(refreshToken);
    const user = userId && userId === payload.userId ? await getUserById(userId) : null;
    if (!user) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const tokens = await generateAuthTokens(user.id, user.email, user.plan);

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      accessToken: tokens.accessToken,
    });
  } catch (error: any) {
    req.log.error({ err: error }, 'refresh failed');
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.post('/logout', generalApiRateLimiter, attachSession, async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    await unlinkSession(req.sessionId);

    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out successfully' });
  } catch (error: any) {
    fail(req, res, error);
  }
});

router.post('/logout-all', generalApiRateLimiter, requireAuth, async (req: Request, res: Response) => {
  try {
    await revokeAllUserTokens(req.user!.userId);
    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out from all devices' });
  } catch (error: any) {
    fail(req, res, error);
  }
});

router.get('/me', generalApiRateLimiter, requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await getUserById(req.user!.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      plan: user.plan,
      created_at: new Date(user.created_at * 1000).toISOString(),
      last_login: user.last_login ? new Date(user.last_login * 1000).toISOString() : null,
    });
  } catch (error: any) {
    fail(req, res, error);
  }
});

router.put('/preferences', generalApiRateLimiter, requireAuth, validateBody(preferencesSchema), async (req: Request, res: Response) => {
  try {
    const { default_model, ui_mode, experience_level, preferred_resolution } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (default_model !== undefined) {
      updates.push('default_model = ?');
      params.push(default_model);
    }
    if (ui_mode !== undefined) {
      updates.push('ui_mode = ?');
      params.push(ui_mode);
    }
    if (experience_level !== undefined) {
      updates.push('experience_level = ?');
      params.push(experience_level);
    }
    if (preferred_resolution !== undefined) {
      updates.push('preferred_resolution = ?');
      params.push(preferred_resolution);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No preferences to update' });
    }

    params.push(req.user!.userId);

    await db.run(`
      UPDATE user_preferences 
      SET ${updates.join(', ')}, updated_at = strftime('%s', 'now')
      WHERE user_id = ?
    `, params);

    res.json({ message: 'Preferences updated' });
  } catch (error: any) {
    fail(req, res, error);
  }
});

router.get('/preferences', generalApiRateLimiter, requireAuth, async (req: Request, res: Response) => {
  try {
    const prefs = await db.get('SELECT * FROM user_preferences WHERE user_id = ?', [req.user!.userId]);

    if (!prefs) {
      return res.status(404).json({ error: 'Preferences not found' });
    }

    res.json({
      default_model: prefs.default_model,
      ui_mode: prefs.ui_mode,
      experience_level: prefs.experience_level,
      preferred_resolution: prefs.preferred_resolution,
    });
  } catch (error: any) {
    fail(req, res, error);
  }
});

export default router;
