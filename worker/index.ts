/**
 * Lucky wheel API on Cloudflare Workers. Static files (the React site in dist/) are served by
 * Workers Static Assets; only /api/* reaches this code (see wrangler.jsonc).
 */
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  eligibilityError,
  MONGOLIA_UTC_OFFSET_MIN,
  nextSpinSlot,
  normalizePhone,
  toPublicConfig,
  validateInput,
} from '../src/lib/rules.ts';
import { generateCode, pickSegment } from '../src/lib/wheel.ts';
import type { SpinRecord, SpinResult } from '../src/types.ts';
import { checkPassword, endSession, isAdmin, startSession } from './auth.ts';
import * as db from './db.ts';

export type AppEnv = {
  Bindings: {
    DB: D1Database;
    ADMIN_PASSWORD: string;
    SESSION_SECRET: string;
    /** Minutes ahead of UTC for daily resets; defaults to Mongolia (480). */
    UTC_OFFSET_MINUTES?: string;
    /** VPS only: "1" when behind a reverse proxy (Caddy/nginx) that sets X-Forwarded-For. */
    TRUST_PROXY?: string;
    /** VPS only: the visitor's direct connection address, filled in by server/index.ts. */
    REMOTE_ADDR?: string;
  };
};

const app = new Hono<AppEnv>().basePath('/api');

const fail = (status: 400 | 401 | 403 | 404 | 429 | 500, message: string) =>
  new HTTPException(status, { message });

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
/**
 * The visitor's IP, used for rate limits.
 *  - Cloudflare: cf-connecting-ip (set by Cloudflare, can't be faked).
 *  - VPS behind a proxy (TRUST_PROXY=1): the last X-Forwarded-For entry, i.e. the address the proxy
 *    itself saw. Earlier entries come from the visitor and can be faked, so they're ignored.
 *  - VPS without a proxy: the direct connection address.
 */
function clientIp(c: Context<AppEnv>): string {
  const cf = c.req.header('cf-connecting-ip');
  if (cf) return cf;
  if (c.env.TRUST_PROXY === '1') {
    const forwarded = c.req.header('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean);
    if (forwarded?.length) return forwarded[forwarded.length - 1];
  }
  return c.env.REMOTE_ADDR || 'local';
}
const offsetMin = (c: Context<AppEnv>) => Number(c.env.UTC_OFFSET_MINUTES ?? MONGOLIA_UTC_OFFSET_MIN) || 0;

/** Uniform random in [0, 1) from the secure generator. */
const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

async function readJson(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  if (Number(c.req.header('content-length') ?? 0) > 200_000) throw fail(400, 'Хүсэлт хэт том байна.');
  try {
    const body = await c.req.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    throw fail(400, 'Буруу хүсэлт.');
  }
}

/** Fixed-window limiter stored in D1, so it holds across all Worker copies. */
async function rateLimit(c: Context<AppEnv>, name: string, windowMs: number, max: number, message: string) {
  const { count, resetMs } = await db.hit(c.env.DB, `${name}:${clientIp(c)}`, windowMs);
  if (count > max) {
    c.header('Retry-After', String(Math.ceil(resetMs / 1000)));
    throw fail(429, message);
  }
}

app.use('*', async (c, next) => {
  if (!c.env.ADMIN_PASSWORD || c.env.ADMIN_PASSWORD.length < 10 || !c.env.SESSION_SECRET) {
    console.error('ADMIN_PASSWORD (10+ chars) and SESSION_SECRET must be set as secrets.');
    throw fail(500, 'Серверийн тохиргоо дутуу байна.');
  }
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
});

// ---------- public ----------

app.get('/wheel', async (c) => c.json(toPublicConfig(await db.getConfig(c.env.DB))));

app.post('/spin', async (c) => {
  await rateLimit(c, 'spin', 60_000, 10, 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.');

  const config = await db.getConfig(c.env.DB);
  if (!config.settings.enabled) throw fail(403, 'Азын хүрд одоогоор идэвхгүй байна.');

  const body = await readJson(c);
  const input = { name: str(body.name, 100), phone: str(body.phone, 30) };
  const invalid = validateInput(input, config.settings, body.consent === true);
  if (invalid) throw fail(400, invalid);

  const phone = normalizePhone(input.phone)!; // validateInput has already checked it
  const ip = clientIp(c);
  const tz = offsetMin(c);

  for (let attempt = 0; attempt < 3; attempt++) {
    const now = Date.now();
    const phoneSpins = await db.spinTimesForPhone(c.env.DB, phone);
    const blocked = eligibilityError(
      phoneSpins,
      await db.spinsFromIpSince(c.env.DB, ip, new Date(now - 86_400_000).toISOString()),
      config.settings,
      now,
      tz,
    );
    if (blocked) throw fail(429, blocked);

    const segmentIndex = pickSegment(config.segments, secureRandom);
    const seg = config.segments[segmentIndex];
    const won = seg.type !== 'none';
    const record: SpinRecord = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      phone,
      segmentId: seg.id,
      label: seg.label,
      type: seg.type,
      value: seg.value,
      code: won ? generateCode(config.settings.couponPrefix) : null,
      expiresAt: won ? new Date(now + config.settings.couponValidDays * 86_400_000).toISOString() : null,
      at: new Date(now).toISOString(),
      redeemedAt: null,
    };

    const outcome = await db.insertSpin(c.env.DB, record, ip, nextSpinSlot(phoneSpins, config.settings, now, tz));
    if (outcome === 'ok') {
      const result: SpinResult = { segments: toPublicConfig(config).segments, segmentIndex, record };
      return c.json(result);
    }
    // 'slot_taken': another request for this number won the race → loop re-checks and refuses.
    // 'code_taken': astronomically unlikely duplicate code → loop tries a fresh one.
  }
  throw fail(429, 'Энэ дугаараар аль хэдийн эргүүлсэн байна.');
});

// ---------- admin ----------

app.get('/admin/session', async (c) => c.json({ authenticated: await isAdmin(c) }));

app.post('/admin/login', async (c) => {
  await rateLimit(c, 'login', 15 * 60_000, 8, 'Хэт олон удаа буруу оролдлоо. 15 минутын дараа дахин оролдоно уу.');
  const body = await readJson(c);
  if (!(await checkPassword(c, str(body.password, 200)))) throw fail(401, 'Нууц үг буруу байна.');
  await startSession(c);
  return c.json({ authenticated: true });
});

app.post('/admin/logout', (c) => {
  endSession(c);
  return c.json({ authenticated: false });
});

app.use('/admin/*', async (c, next) => {
  if (!(await isAdmin(c))) throw fail(401, 'Нэвтрэх шаардлагатай.');
  await next();
});

app.get('/admin/config', async (c) => c.json(await db.getConfig(c.env.DB)));
app.put('/admin/config', async (c) => c.json(await db.saveConfig(c.env.DB, await readJson(c))));
app.post('/admin/config/reset', async (c) => c.json(await db.resetConfig(c.env.DB)));

app.get('/admin/spins', async (c) => c.json(await db.listSpins(c.env.DB)));
app.delete('/admin/spins', async (c) => {
  await db.deleteAllSpins(c.env.DB);
  return c.json({ ok: true });
});

app.get('/admin/contacts', async (c) => c.json(await db.listContacts(c.env.DB)));
app.put('/admin/contacts/:phone', async (c) => {
  const phone = normalizePhone(str(c.req.param('phone'), 30));
  if (!phone) throw fail(400, 'Утасны дугаар буруу байна.');
  const body = await readJson(c);
  return c.json(await db.saveContact(c.env.DB, phone, body.contacted === true, str(body.note, 1000)));
});

const cleanCode = (v: string) => v.slice(0, 40).trim().toUpperCase();
app.get('/admin/coupons/:code', async (c) => c.json(await db.findCoupon(c.env.DB, cleanCode(c.req.param('code')))));
app.post('/admin/coupons/:code/redeem', async (c) => c.json(await db.redeemCoupon(c.env.DB, cleanCode(c.req.param('code')))));

// ---------- errors ----------

app.notFound((c) => c.json({ error: 'Олдсонгүй.' }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    c.header('Cache-Control', 'no-store');
    return c.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: 'Серверийн алдаа гарлаа. Дахин оролдоно уу.' }, 500);
});

export default app;
