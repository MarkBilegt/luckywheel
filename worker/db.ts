import { DEFAULT_CONFIG } from '../src/config/defaults.ts';
import { sanitizeConfig } from '../src/lib/rules.ts';
import type { Config, Contact, CouponStatus, PrizeType, SpinRecord } from '../src/types.ts';

// ---------- config ----------
// Read on every request: Workers run as many short-lived copies, so a cache could serve stale prizes.

export async function getConfig(db: D1Database): Promise<Config> {
  const row = await db.prepare('SELECT json FROM config WHERE id = 1').first<{ json: string }>();
  if (!row) return sanitizeConfig(DEFAULT_CONFIG);
  try {
    return sanitizeConfig(JSON.parse(row.json));
  } catch {
    console.error('Stored config is not valid JSON; using defaults.');
    return sanitizeConfig(DEFAULT_CONFIG);
  }
}

export async function saveConfig(db: D1Database, raw: unknown): Promise<Config> {
  const clean = sanitizeConfig(raw);
  await db
    .prepare(
      `INSERT INTO config (id, json, updated_at) VALUES (1, ?, ?)
       ON CONFLICT (id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
    )
    .bind(JSON.stringify(clean), new Date().toISOString())
    .run();
  return clean;
}

export async function resetConfig(db: D1Database): Promise<Config> {
  await db.prepare('DELETE FROM config').run();
  return getConfig(db);
}

// ---------- spins ----------

interface SpinRow {
  id: string;
  name: string;
  phone: string;
  segment_id: string;
  label: string;
  type: string;
  value: number;
  code: string | null;
  expires_at: string | null;
  created_at: string;
  redeemed_at: string | null;
}

function toRecord(r: SpinRow): SpinRecord {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    segmentId: r.segment_id,
    label: r.label,
    type: r.type as PrizeType,
    value: r.value,
    code: r.code,
    expiresAt: r.expires_at,
    at: r.created_at,
    redeemedAt: r.redeemed_at,
  };
}

const SPIN_COLUMNS = 'id, name, phone, segment_id, label, type, value, code, expires_at, created_at, redeemed_at';

export async function spinTimesForPhone(db: D1Database, phone: string): Promise<number[]> {
  const { results } = await db.prepare('SELECT created_at FROM spins WHERE phone = ?').bind(phone).all<{ created_at: string }>();
  return results.map((r) => Date.parse(r.created_at));
}

export async function spinsFromIpSince(db: D1Database, ip: string, sinceIso: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM spins WHERE ip = ? AND created_at >= ?').bind(ip, sinceIso).first<{ n: number }>();
  return row?.n ?? 0;
}

export type InsertResult = 'ok' | 'slot_taken' | 'code_taken';

/** Inserts a spin. The UNIQUE (phone, slot) and UNIQUE code rules make simultaneous duplicates fail cleanly. */
export async function insertSpin(db: D1Database, r: SpinRecord, ip: string, slot: string): Promise<InsertResult> {
  try {
    await db
      .prepare(
        `INSERT INTO spins (id, phone, name, segment_id, label, type, value, code, expires_at, created_at, ip, slot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(r.id, r.phone, r.name, r.segmentId, r.label, r.type, r.value, r.code, r.expiresAt, r.at, ip, slot)
      .run();
    return 'ok';
  } catch (err) {
    const msg = String(err);
    if (msg.includes('UNIQUE') && msg.includes('spins.code')) return 'code_taken';
    if (msg.includes('UNIQUE')) return 'slot_taken';
    throw err;
  }
}

export async function listSpins(db: D1Database): Promise<SpinRecord[]> {
  const { results } = await db
    .prepare(`SELECT ${SPIN_COLUMNS} FROM spins ORDER BY created_at DESC LIMIT 50000`)
    .all<SpinRow>();
  return results.map(toRecord);
}

export async function deleteAllSpins(db: D1Database): Promise<void> {
  await db.batch([db.prepare('DELETE FROM spins'), db.prepare('DELETE FROM contacts')]);
}

// ---------- call-back notes ----------

export async function listContacts(db: D1Database): Promise<Contact[]> {
  const { results } = await db
    .prepare('SELECT phone, contacted, note, updated_at FROM contacts')
    .all<{ phone: string; contacted: number; note: string; updated_at: string | null }>();
  return results.map((r) => ({ phone: r.phone, contacted: !!r.contacted, note: r.note, updatedAt: r.updated_at }));
}

export async function saveContact(db: D1Database, phone: string, contacted: boolean, note: string): Promise<Contact> {
  const updatedAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO contacts (phone, contacted, note, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (phone) DO UPDATE SET contacted = excluded.contacted, note = excluded.note, updated_at = excluded.updated_at`,
    )
    .bind(phone, contacted ? 1 : 0, note, updatedAt)
    .run();
  return { phone, contacted, note, updatedAt };
}

// ---------- coupons ----------

export async function findCoupon(db: D1Database, code: string): Promise<{ status: CouponStatus; record: SpinRecord | null }> {
  const row = await db.prepare(`SELECT ${SPIN_COLUMNS} FROM spins WHERE code = ?`).bind(code).first<SpinRow>();
  if (!row) return { status: 'not_found', record: null };
  const record = toRecord(row);
  if (record.redeemedAt) return { status: 'redeemed', record };
  if (record.expiresAt && Date.parse(record.expiresAt) < Date.now()) return { status: 'expired', record };
  return { status: 'valid', record };
}

/** Marks a valid code as used. The WHERE clause makes it safe if two staff press the button at once. */
export async function redeemCoupon(db: D1Database, code: string) {
  const current = await findCoupon(db, code);
  if (current.status !== 'valid') return current;
  await db.prepare('UPDATE spins SET redeemed_at = ? WHERE code = ? AND redeemed_at IS NULL').bind(new Date().toISOString(), code).run();
  return findCoupon(db, code);
}

// ---------- rate limiting ----------

/**
 * Counts a hit for `key` in the current fixed window and returns the count so far.
 * A single upsert statement, so it's atomic even with many Worker copies running.
 */
export async function hit(db: D1Database, key: string, windowMs: number): Promise<{ count: number; resetMs: number }> {
  const now = Date.now();
  const windowStart = now - (now % windowMs);
  const row = await db
    .prepare(
      `INSERT INTO rate_hits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  // Occasionally clear out old windows.
  if (Math.random() < 0.02) {
    await db.prepare('DELETE FROM rate_hits WHERE window_start < ?').bind(now - 86_400_000).run();
  }
  return { count: row?.count ?? 1, resetMs: windowStart + windowMs - now };
}
