import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from './env.ts';

const COOKIE = 'lw_admin';
const SESSION_MS = 12 * 60 * 60 * 1000;

function sign(payload: string): string {
  return createHmac('sha256', env.sessionSecret).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  // Hash first so the comparison is constant-time regardless of length.
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassword(password: string): boolean {
  return safeEqual(password, env.adminPassword);
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function isAdmin(req: Request): boolean {
  const token = readCookie(req, COOKIE);
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !safeEqual(sig, sign(exp))) return false;
  return Number(exp) > Date.now();
}

export function startSession(res: Response): void {
  const exp = String(Date.now() + SESSION_MS);
  res.cookie(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true,
    sameSite: 'strict', // also blocks cross-site form posts (CSRF)
    secure: env.isProd,
    maxAge: SESSION_MS,
    path: '/api',
  });
}

export function endSession(res: Response): void {
  res.clearCookie(COOKIE, { path: '/api' });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'Нэвтрэх шаардлагатай.' });
}
