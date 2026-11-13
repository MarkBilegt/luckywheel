import { randomBytes } from 'node:crypto';

// Daily spin resets and dates use Mongolian time unless told otherwise.
process.env.TZ ||= 'Asia/Ulaanbaatar';

const isProd = process.env.NODE_ENV === 'production';

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`\n✖ ${name} is not set. Copy .env.example to .env and fill it in.\n`);
    process.exit(1);
  }
  return v;
}

const adminPassword = required('ADMIN_PASSWORD');
if (adminPassword.length < 10) {
  console.error('\n✖ ADMIN_PASSWORD must be at least 10 characters.\n');
  process.exit(1);
}

let sessionSecret = process.env.SESSION_SECRET?.trim() ?? '';
if (!sessionSecret) {
  if (isProd) required('SESSION_SECRET');
  sessionSecret = randomBytes(32).toString('hex');
  console.warn('⚠ SESSION_SECRET not set: using a random one, so admin logins reset when the server restarts.');
}

export const env = {
  isProd,
  port: Number(process.env.PORT) || 3001,
  databasePath: process.env.DATABASE_PATH || 'data/luckywheel.db',
  adminPassword,
  sessionSecret,
  /** Set to 1 when running behind nginx / a load balancer so the real visitor IP is used. */
  trustProxy: process.env.TRUST_PROXY === '1',
};
