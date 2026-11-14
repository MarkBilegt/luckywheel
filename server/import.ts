/**
 * Move data from Cloudflare D1 to the VPS.
 *
 *   1. On a computer logged in to Cloudflare:   npm run db:backup          (→ backup.sql)
 *   2. Copy backup.sql to the server, stop the site, then:
 *        npm run vps:import -- backup.sql
 *      (Docker: docker compose run --rm -v ./backup.sql:/app/backup.sql app npm run vps:import -- backup.sql)
 *
 * The SQL is loaded into a brand-new database file first; only if that works is it swapped in.
 * The previous database is kept next to it as luckywheel.before-import-<time>.db.
 */
import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyMigrations, SqliteD1 } from './d1-sqlite.ts';

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error('Usage: npm run vps:import -- <export.sql from `npm run db:backup`>');
  process.exit(1);
}
const dbPath = process.env.DATABASE_PATH || 'data/luckywheel.db';
const temp = `${dbPath}.importing`;
for (const f of [temp, `${temp}-wal`, `${temp}-shm`]) rmSync(f, { force: true });

const fresh = new SqliteD1(temp);
try {
  fresh.db.exec(readFileSync(file, 'utf8'));
  applyMigrations(fresh, resolve('migrations')); // no-op if the export already had them; fills gaps otherwise
  const count = (t: string) => (fresh.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
  console.log(`Imported: ${count('spins')} spins, ${count('contacts')} call notes, config ${count('config') ? 'yes' : 'no (defaults)'}.`);
  fresh.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  fresh.close();
} catch (err) {
  fresh.close();
  rmSync(temp, { force: true });
  console.error(`Import failed, nothing changed: ${(err as Error).message}`);
  process.exit(1);
}

if (existsSync(dbPath)) {
  const keep = `${dbPath.replace(/\.db$/, '')}.before-import-${Date.now()}.db`;
  renameSync(dbPath, keep);
  for (const s of ['-wal', '-shm']) rmSync(dbPath + s, { force: true });
  console.log(`Previous database kept as ${keep}`);
}
renameSync(temp, dbPath);
for (const s of ['-wal', '-shm']) rmSync(temp + s, { force: true });
console.log(`Done: ${dbPath} is ready. Start the site again.`);
