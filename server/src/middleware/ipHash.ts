import { Request, Response, NextFunction } from 'express';
import { hashIP } from '../utils/crypto.js';

export function attachIPHash(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  (req as any).ipHash = hashIP(ip);
  next();
}

