/**
 * Snapshot of the VPS database (safe while the site is running).
 *   npm run vps:backup                      → backups/luckywheel-2026-11-14-0930.db
 *   docker compose exec app npm run vps:backup
 * Keeps the newest 30 snapshots.
 */
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dbPath = process.env.DATABASE_PATH || 'data/luckywheel.db';
const dir = process.env.BACKUP_DIR || 'backups';
const KEEP = 30;

mkdirSync(dir, { recursive: true });
const d = new Date();
const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
const target = join(dir, `luckywheel-${stamp}.db`);

const db = new DatabaseSync(dbPath, { readOnly: true });
db.prepare('VACUUM INTO ?').run(target); // consistent copy, even with the site writing to it
db.close();
console.log(`Backup saved: ${target} (${Math.round(statSync(target).size / 1024)} KB)`);

const old = readdirSync(dir).filter((f) => /^luckywheel-.*\.db$/.test(f)).sort().reverse().slice(KEEP);
for (const f of old) rmSync(join(dir, f));
if (old.length) console.log(`Removed ${old.length} old backup(s), keeping the newest ${KEEP}.`);
