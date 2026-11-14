/**
 * VPS / Docker entry point: runs the same API as the Cloudflare Worker (worker/index.ts) on Node,
 * with SQLite instead of D1, and serves the built website from dist/.
 *
 *   npm run build && npm run start:node
 *
 * Settings come from environment variables (see .env.example).
 */
import { serve, type HttpBindings } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import api from '../worker/index.ts';
import { applyMigrations, SqliteD1 } from './d1-sqlite.ts';

const env = process.env;

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const ADMIN_PASSWORD = env.ADMIN_PASSWORD?.trim() ?? '';
const SESSION_SECRET = env.SESSION_SECRET?.trim() ?? '';
if (ADMIN_PASSWORD.length < 10) fail('ADMIN_PASSWORD must be set and at least 10 characters (see .env.example).');
if (SESSION_SECRET.length < 32) fail('SESSION_SECRET must be set to a long random string (see .env.example).');
if (!existsSync('dist/index.html')) fail('dist/ not found. Run `npm run build` first.');

// ---------- database ----------
const dbPath = env.DATABASE_PATH || 'data/luckywheel.db';
const db = new SqliteD1(dbPath);
const applied = applyMigrations(db, resolve('migrations'));
if (applied.length) console.log(`Applied migrations: ${applied.join(', ')}`);

const bindings = {
  DB: db as never, // implements the D1 calls worker/db.ts uses
  ADMIN_PASSWORD,
  SESSION_SECRET,
  UTC_OFFSET_MINUTES: env.UTC_OFFSET_MINUTES || '480',
  TRUST_PROXY: env.TRUST_PROXY,
};

// ---------- web server ----------
const app = new Hono<{ Bindings: HttpBindings }>();

// Same security headers Cloudflare adds from public/_headers.
app.use('*', async (c, next) => {
  await next();
  c.header('X-Frame-Options', 'DENY');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'same-origin');
});

// The API: hand the request to the exact same app the Cloudflare Worker runs.
app.all('/api/*', (c) => api.fetch(c.req.raw, { ...bindings, REMOTE_ADDR: c.env.incoming.socket.remoteAddress ?? '' }));

// Built files. Hashed assets never change, so browsers can keep them for a year.
app.use(
  '/assets/*',
  serveStatic({ root: './dist', onFound: (_path, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable') }),
);
app.use('*', serveStatic({ root: './dist' }));
// Any other page → the app (it handles #/admin itself).
app.get('*', serveStatic({ path: './dist/index.html', onFound: (_path, c) => c.header('Cache-Control', 'no-cache') }));

const port = Number(env.PORT) || 3000;
const server = serve({ fetch: app.fetch, port, hostname: env.HOST || '0.0.0.0' }, () => {
  console.log(`Lucky wheel running on http://localhost:${port}  (database: ${dbPath})`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
