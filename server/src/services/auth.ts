import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { generateRequestId } from '../utils/crypto.js';
import { db, transaction } from '../database/db.js';
import { createHash, randomUUID } from 'crypto';
import { config } from '../config/env.js';

const JWT_SECRET = config.jwtSecret;
const JWT_REFRESH_SECRET = config.jwtRefreshSecret;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

export interface JWTPayload {
  userId: string;
  email: string;
  plan: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId, jti: randomUUID() }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as { userId: string };
  } catch {
    return null;
  }
}

export async function createUser(email: string, password: string) {
  const plan = 'free';
  const userId = generateRequestId();
  const passwordHash = await hashPassword(password);

  try {
    await db.run(`
      INSERT INTO users (id, email, password_hash, plan, created_at)
      VALUES (?, ?, ?, ?, strftime('%s', 'now'))
    `, [userId, email, passwordHash, plan]);
  } catch (error: any) {
    if (error?.code === '23505') throw new Error('Email already registered');
    throw error;
  }

  await db.run(`
    INSERT INTO user_preferences (user_id)
    VALUES (?)
  `, [userId]);

  return { id: userId, email, plan };
}

let dummyHash: string | undefined;

export async function authenticateUser(email: string, password: string) {
  const user = await db.get('SELECT * FROM users WHERE lower(email) = lower(?) AND is_active = 1', [email]);
  if (!user) {
    dummyHash ??= await hashPassword('timing-equaliser');
    await verifyPassword(password, dummyHash);
    throw new Error('Invalid email or password');
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    throw new Error('Invalid email or password');
  }

  await db.run('UPDATE users SET last_login = strftime("%s", "now") WHERE id = ?', [user.id]);

  return { id: user.id, email: user.email, plan: user.plan };
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function storeRefreshToken(userId: string, token: string) {
  const tokenId = generateRequestId();
  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

  await db.run(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `, [tokenId, userId, hashToken(token), expiresAt]);
}

export async function revokeRefreshToken(token: string) {
  await db.run(`
    UPDATE refresh_tokens
    SET revoked_at = strftime('%s', 'now')
    WHERE token_hash = ?
  `, [hashToken(token)]);
}

export async function rotateRefreshToken(token: string): Promise<string | null> {
  return transaction(async (tx) => {
    const row = await tx.get<{ user_id: string; revoked_at: number | null; expires_at: number }>(
      'SELECT user_id, revoked_at, expires_at FROM refresh_tokens WHERE token_hash = ? FOR UPDATE',
      [hashToken(token)]
    );
    if (!row) return null;
    if (row.revoked_at) {
      await tx.run("UPDATE refresh_tokens SET revoked_at = strftime('%s', 'now') WHERE user_id = ? AND revoked_at IS NULL", [row.user_id]);
      await tx.run('UPDATE sessions SET user_id = NULL WHERE user_id = ?', [row.user_id]);
      return null;
    }
    if (row.expires_at < Math.floor(Date.now() / 1000)) return null;
    await tx.run("UPDATE refresh_tokens SET revoked_at = strftime('%s', 'now') WHERE token_hash = ?", [hashToken(token)]);
    return row.user_id;
  });
}

export async function linkSession(sessionId: string | undefined, userId: string): Promise<void> {
  if (sessionId) await db.run('UPDATE sessions SET user_id = ? WHERE id = ?', [userId, sessionId]);
}

export async function unlinkSession(sessionId: string | undefined): Promise<void> {
  if (sessionId) await db.run('UPDATE sessions SET user_id = NULL WHERE id = ?', [sessionId]);
}

export async function revokeAllUserTokens(userId: string) {
  await db.run(`
    UPDATE refresh_tokens
    SET revoked_at = strftime('%s', 'now')
    WHERE user_id = ? AND revoked_at IS NULL
  `, [userId]);
  await db.run('UPDATE sessions SET user_id = NULL WHERE user_id = ?', [userId]);
}

export async function getUserById(userId: string) {
  const user = await db.get('SELECT id, email, plan, created_at, last_login FROM users WHERE id = ? AND is_active = 1', [userId]);
  return user || null;
}

export async function generateAuthTokens(userId: string, email: string, plan: string): Promise<AuthTokens> {
  const accessToken = generateAccessToken({ userId, email, plan });
  const refreshToken = generateRefreshToken(userId);

  await storeRefreshToken(userId, refreshToken);

  return { accessToken, refreshToken };
}
