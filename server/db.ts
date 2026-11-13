import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_CONFIG } from '../src/config/defaults.ts';
import { sanitizeConfig } from '../src/lib/rules.ts';
import type { Config, Contact, CouponStatus, PrizeType, SpinRecord } from '../src/types.ts';
import { env } from './env.ts';

mkdirSync(dirname(env.databasePath), { recursive: true });
const db = new DatabaseSync(env.databasePath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
`);

// Early versions identified visitors by email. Keep that table as a backup and move rows that have a phone.
const oldColumns = db.prepare(`SELECT name FROM pragma_table_info('spins')`).all() as { name: string }[];
const migratingFromEmail = oldColumns.some((c) => c.name === 'email');
if (migratingFromEmail) {
  db.exec(`
    ALTER TABLE spins RENAME TO spins_email_backup;
    DROP INDEX IF EXISTS spins_email;
    DROP INDEX IF EXISTS spins_created;
    DROP INDEX IF EXISTS spins_ip;
  `);
  console.log('Migrated: old email-based spins kept in table spins_email_backup.');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    json       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS spins (
    id          TEXT PRIMARY KEY,
    phone       TEXT NOT NULL,
    name        TEXT NOT NULL DEFAULT '',
    segment_id  TEXT NOT NULL,
    label       TEXT NOT NULL,
    type        TEXT NOT NULL,
    value       REAL NOT NULL DEFAULT 0,
    code        TEXT UNIQUE,
    expires_at  TEXT,
    created_at  TEXT NOT NULL,
    ip          TEXT NOT NULL DEFAULT '',
    redeemed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS spins_phone   ON spins (phone);
  CREATE INDEX IF NOT EXISTS spins_created ON spins (created_at);
  CREATE INDEX IF NOT EXISTS spins_ip      ON spins (ip, created_at);

  CREATE TABLE IF NOT EXISTS contacts (
    phone      TEXT PRIMARY KEY,
    contacted  INTEGER NOT NULL DEFAULT 0,
    note       TEXT NOT NULL DEFAULT '',
    updated_at TEXT
  );
`);

if (migratingFromEmail) {
  db.exec(`
    INSERT OR IGNORE INTO spins (id, phone, name, segment_id, label, type, value, code, expires_at, created_at, ip, redeemed_at)
    SELECT id, phone, name, segment_id, label, type, value, code, expires_at, created_at, ip, redeemed_at
    FROM spins_email_backup WHERE phone != '';
  `);
}

// ---------- config ----------

const getConfigStmt = db.prepare('SELECT json FROM config WHERE id = 1');
const upsertConfigStmt = db.prepare(
  `INSERT INTO config (id, json, updated_at) VALUES (1, ?, ?)
   ON CONFLICT (id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
);

let cached: Config | null = null;

export function getConfig(): Config {
  if (cached) return cached;
  const row = getConfigStmt.get() as { json: string } | undefined;
  let parsed: unknown = DEFAULT_CONFIG;
  if (row) {
    try {
      parsed = JSON.parse(row.json);
    } catch {
      console.error('Stored config is not valid JSON; using defaults.');
    }
  }
  cached = sanitizeConfig(parsed);
  return cached;
}

export function saveConfig(config: Config): Config {
  const clean = sanitizeConfig(config);
  upsertConfigStmt.run(JSON.stringify(clean), new Date().toISOString());
  cached = clean;
  return clean;
}

export function resetConfig(): Config {
  db.prepare('DELETE FROM config').run();
  cached = null;
  return getConfig();
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

const phoneSpinsStmt = db.prepare('SELECT created_at FROM spins WHERE phone = ?');
const ipCountStmt = db.prepare('SELECT COUNT(*) AS n FROM spins WHERE ip = ? AND created_at >= ?');
const codeExistsStmt = db.prepare('SELECT 1 FROM spins WHERE code = ?');
const insertSpinStmt = db.prepare(
  `INSERT INTO spins (id, phone, name, segment_id, label, type, value, code, expires_at, created_at, ip)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

export function spinTimesForPhone(phone: string): number[] {
  return (phoneSpinsStmt.all(phone) as { created_at: string }[]).map((r) => Date.parse(r.created_at));
}

export function spinsFromIpSince(ip: string, sinceIso: string): number {
  return (ipCountStmt.get(ip, sinceIso) as { n: number }).n;
}

export function codeExists(code: string): boolean {
  return !!codeExistsStmt.get(code);
}

export function insertSpin(r: SpinRecord, ip: string): void {
  insertSpinStmt.run(r.id, r.phone, r.name, r.segmentId, r.label, r.type, r.value, r.code, r.expiresAt, r.at, ip);
}

export function listSpins(fromIso?: string, toIso?: string): SpinRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM spins WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC LIMIT 100000`,
    )
    .all(fromIso || '0000', toIso || '9999') as unknown as SpinRow[];
  return rows.map(toRecord);
}

export function deleteAllSpins(): void {
  db.exec('DELETE FROM spins; DELETE FROM contacts;');
}

// ---------- call-back notes ----------

export function listContacts(): Contact[] {
  const rows = db.prepare('SELECT phone, contacted, note, updated_at FROM contacts').all() as {
    phone: string;
    contacted: number;
    note: string;
    updated_at: string | null;
  }[];
  return rows.map((r) => ({ phone: r.phone, contacted: !!r.contacted, note: r.note, updatedAt: r.updated_at }));
}

export function saveContact(phone: string, contacted: boolean, note: string): Contact {
  const updatedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO contacts (phone, contacted, note, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (phone) DO UPDATE SET contacted = excluded.contacted, note = excluded.note, updated_at = excluded.updated_at`,
  ).run(phone, contacted ? 1 : 0, note, updatedAt);
  return { phone, contacted, note, updatedAt };
}

// ---------- coupons ----------

const byCodeStmt = db.prepare('SELECT * FROM spins WHERE code = ?');
const redeemStmt = db.prepare('UPDATE spins SET redeemed_at = ? WHERE code = ? AND redeemed_at IS NULL');

export function findCoupon(code: string): { status: CouponStatus; record: SpinRecord | null } {
  const row = byCodeStmt.get(code) as SpinRow | undefined;
  if (!row) return { status: 'not_found', record: null };
  const record = toRecord(row);
  if (record.redeemedAt) return { status: 'redeemed', record };
  if (record.expiresAt && Date.parse(record.expiresAt) < Date.now()) return { status: 'expired', record };
  return { status: 'valid', record };
}

/** Marks a valid code as used. Returns the new state (unchanged if it wasn't valid). */
export function redeemCoupon(code: string): { status: CouponStatus; record: SpinRecord | null } {
  const current = findCoupon(code);
  if (current.status !== 'valid') return current;
  redeemStmt.run(new Date().toISOString(), code);
  return findCoupon(code);
}

/** Runs fn inside a write transaction so check-then-insert can't interleave. */
export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
