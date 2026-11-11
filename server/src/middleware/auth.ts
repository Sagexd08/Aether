import { timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';
import { verifyAccessToken, JWTPayload } from '../services/auth.js';
import { recordGuardEvent } from '../services/metrics.js';

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-admin-token'];
  const expected = Buffer.from(config.adminApiToken);
  const given = Buffer.from(typeof token === 'string' ? token : '');

  if (expected.length === 0 || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    void recordGuardEvent('admin_auth_failed', req);
    return res.status(401).json({ error: 'Unauthorized. Admin token required.' });
  }
  
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const token = authHeader.substring(7);
  const payload = verifyAccessToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = payload;
  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);
    if (payload) {
      req.user = payload;
    }
  }

  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.plan !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

