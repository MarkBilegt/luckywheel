import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from './index.ts';

const COOKIE = 'lw_admin';
const SESSION_MS = 12 * 60 * 60 * 1000;
const enc = new TextEncoder();

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Constant-time string comparison (hash both so lengths always match). */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

export function checkPassword(c: Context<AppEnv>, password: string): Promise<boolean> {
  return safeEqual(password, c.env.ADMIN_PASSWORD);
}

export async function isAdmin(c: Context<AppEnv>): Promise<boolean> {
  const token = getCookie(c, COOKIE);
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !(await safeEqual(sig, await sign(c.env.SESSION_SECRET, exp)))) return false;
  return Number(exp) > Date.now();
}

export async function startSession(c: Context<AppEnv>): Promise<void> {
  const exp = String(Date.now() + SESSION_MS);
  setCookie(c, COOKIE, `${exp}.${await sign(c.env.SESSION_SECRET, exp)}`, {
    httpOnly: true,
    secure: true, // browsers also allow secure cookies on http://localhost
    sameSite: 'Strict', // blocks cross-site form posts (CSRF)
    path: '/api',
    maxAge: SESSION_MS / 1000,
  });
}

export function endSession(c: Context<AppEnv>): void {
  deleteCookie(c, COOKIE, { path: '/api', secure: true });
}
