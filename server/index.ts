import './env.ts'; // must load first: sets TZ before any dates are created
import { randomInt, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { eligibilityError, normalizePhone, toPublicConfig, validateInput } from '../src/lib/rules.ts';
import { generateCode, pickSegment } from '../src/lib/wheel.ts';
import type { SpinRecord, SpinResult } from '../src/types.ts';
import { checkPassword, endSession, isAdmin, requireAdmin, startSession } from './auth.ts';
import * as db from './db.ts';
import { env } from './env.ts';
import { rateLimit } from './rateLimit.ts';

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const app = express();
app.disable('x-powered-by');
if (env.trustProxy) app.set('trust proxy', 1);
app.use(express.json({ limit: '200kb' }));

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
/** Uniform random in [0, 1) from the OS's secure generator. */
const secureRandom = () => randomInt(0, 2 ** 32) / 2 ** 32;

// ---------- public ----------

app.get('/api/wheel', (_req, res) => {
  res.json(toPublicConfig(db.getConfig()));
});

app.post(
  '/api/spin',
  rateLimit({ windowMs: 60_000, max: 10, message: 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.' }),
  (req, res) => {
    const config = db.getConfig();
    if (!config.settings.enabled) throw new HttpError(403, 'Азын хүрд одоогоор идэвхгүй байна.');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const input = { name: str(body.name, 100), phone: str(body.phone, 30) };
    const invalid = validateInput(input, config.settings, body.consent === true);
    if (invalid) throw new HttpError(400, invalid);

    const phone = normalizePhone(input.phone)!; // validateInput has already checked it
    const ip = req.ip ?? '';

    // Check-then-insert inside one transaction so two quick requests can't both get a spin.
    const result = db.transaction((): SpinResult => {
      const now = Date.now();
      const blocked = eligibilityError(
        db.spinTimesForPhone(phone),
        db.spinsFromIpSince(ip, new Date(now - 86_400_000).toISOString()),
        config.settings,
        now,
      );
      if (blocked) throw new HttpError(429, blocked);

      const segmentIndex = pickSegment(config.segments, secureRandom);
      const seg = config.segments[segmentIndex];
      const won = seg.type !== 'none';
      let code: string | null = null;
      if (won) {
        do code = generateCode(config.settings.couponPrefix);
        while (db.codeExists(code));
      }

      const record: SpinRecord = {
        id: randomUUID(),
        name: input.name.trim(),
        phone,
        segmentId: seg.id,
        label: seg.label,
        type: seg.type,
        value: seg.value,
        code,
        expiresAt: won ? new Date(now + config.settings.couponValidDays * 86_400_000).toISOString() : null,
        at: new Date(now).toISOString(),
        redeemedAt: null,
      };
      db.insertSpin(record, ip);
      return { segments: toPublicConfig(config).segments, segmentIndex, record };
    });

    res.json(result);
  },
);

// ---------- admin ----------

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 8,
  message: 'Хэт олон удаа буруу оролдлоо. 15 минутын дараа дахин оролдоно уу.',
});

app.get('/api/admin/session', (req, res) => {
  res.json({ authenticated: isAdmin(req) });
});

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const password = str((req.body ?? {}).password, 200);
  if (!checkPassword(password)) throw new HttpError(401, 'Нууц үг буруу байна.');
  startSession(res);
  res.json({ authenticated: true });
});

app.post('/api/admin/logout', (_req, res) => {
  endSession(res);
  res.json({ authenticated: false });
});

app.use('/api/admin', requireAdmin);

app.get('/api/admin/config', (_req, res) => {
  res.json(db.getConfig());
});

app.put('/api/admin/config', (req, res) => {
  res.json(db.saveConfig(req.body));
});

app.post('/api/admin/config/reset', (_req, res) => {
  res.json(db.resetConfig());
});

const isoOrEmpty = (v: unknown) => {
  const s = str(v, 40);
  return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : '';
};

app.get('/api/admin/spins', (req, res) => {
  res.json(db.listSpins(isoOrEmpty(req.query.from), isoOrEmpty(req.query.to)));
});

app.delete('/api/admin/spins', (_req, res) => {
  db.deleteAllSpins();
  res.json({ ok: true });
});

app.get('/api/admin/contacts', (_req, res) => {
  res.json(db.listContacts());
});

app.put('/api/admin/contacts/:phone', (req, res) => {
  const phone = normalizePhone(str(req.params.phone, 30));
  if (!phone) throw new HttpError(400, 'Утасны дугаар буруу байна.');
  const body = (req.body ?? {}) as Record<string, unknown>;
  res.json(db.saveContact(phone, body.contacted === true, str(body.note, 1000)));
});

const cleanCode = (v: unknown) => str(v, 40).trim().toUpperCase();

app.get('/api/admin/coupons/:code', (req, res) => {
  res.json(db.findCoupon(cleanCode(req.params.code)));
});

app.post('/api/admin/coupons/:code/redeem', (req, res) => {
  res.json(db.redeemCoupon(cleanCode(req.params.code)));
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Олдсонгүй.' });
});

// ---------- the built React app (production) ----------

const dist = resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(join(dist, 'index.html'));
  });
}

// ---------- errors ----------

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Буруу хүсэлт.' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Серверийн алдаа гарлаа. Дахин оролдоно уу.' });
});

app.listen(env.port, () => {
  console.log(`Lucky wheel API on http://localhost:${env.port}  (db: ${env.databasePath})`);
});
