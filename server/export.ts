/**
 * Move data from the VPS to Cloudflare D1 (the reverse of import.ts).
 *
 *   npm run vps:export                       → export.sql (config, spins, call notes)
 *   npx wrangler d1 execute luckywheel --remote --file export.sql
 *
 * Uses INSERT OR REPLACE, so it can be run into a D1 database that already has the tables.
 */
import { writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const dbPath = process.env.DATABASE_PATH || 'data/luckywheel.db';
const out = process.argv[2] || 'export.sql';
const db = new DatabaseSync(dbPath, { readOnly: true });

const quote = (v: unknown) =>
  v === null || v === undefined ? 'NULL' : typeof v === 'number' || typeof v === 'bigint' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;

const lines: string[] = [];
let total = 0;
for (const table of ['config', 'spins', 'contacts']) {
  const rows = db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
  for (const row of rows) {
    const cols = Object.keys(row);
    lines.push(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => quote(row[c])).join(', ')});`);
  }
  console.log(`${table}: ${rows.length} rows`);
  total += rows.length;
}
db.close();
writeFileSync(out, lines.join('\n') + '\n');
console.log(`Wrote ${total} rows to ${out}. Load into Cloudflare with: npx wrangler d1 execute luckywheel --remote --file ${out}`);
