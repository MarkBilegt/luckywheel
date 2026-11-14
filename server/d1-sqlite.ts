/**
 * A tiny stand-in for Cloudflare D1 on top of Node's built-in SQLite (node:sqlite).
 * It implements the parts of the D1 API that worker/db.ts uses, so the same database code runs
 * on Cloudflare and on a VPS:
 *   db.prepare(sql).bind(...values).first() / .all() / .run()
 *   db.batch([...statements])   (all-or-nothing, like D1)
 */
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';

type Row = Record<string, unknown>;

export class SqliteD1 {
  readonly db: DatabaseSync;
  private cache = new Map<string, StatementSync>();

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  }

  prepare(sql: string): SqliteStatement {
    return new SqliteStatement(this, sql, []);
  }

  /** Runs all statements in one transaction; if any fails, none are applied. */
  async batch(statements: SqliteStatement[]) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((s) => s.runSync());
      this.db.exec('COMMIT');
      return results;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async exec(sql: string) {
    this.db.exec(sql);
    return { count: 0, duration: 0 };
  }

  /** Prepared statements are cached and reused (same SQL text → same compiled statement). */
  statement(sql: string): StatementSync {
    let stmt = this.cache.get(sql);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.cache.set(sql, stmt);
    }
    return stmt;
  }

  close() {
    this.db.close();
  }
}

export class SqliteStatement {
  private readonly owner: SqliteD1;
  private readonly sql: string;
  private readonly values: SQLInputValue[];

  constructor(owner: SqliteD1, sql: string, values: SQLInputValue[]) {
    this.owner = owner;
    this.sql = sql;
    this.values = values;
  }

  bind(...values: unknown[]): SqliteStatement {
    return new SqliteStatement(this.owner, this.sql, values.map(toSql));
  }

  async first<T = Row>(column?: string): Promise<T | null> {
    const row = this.owner.statement(this.sql).get(...this.values) as Row | undefined;
    if (!row) return null;
    return (column ? row[column] : { ...row }) as T;
  }

  async all<T = Row>(): Promise<{ results: T[]; success: true; meta: Record<string, unknown> }> {
    const rows = this.owner.statement(this.sql).all(...this.values) as Row[];
    return { results: rows.map((r) => ({ ...r }) as T), success: true, meta: {} };
  }

  async run() {
    return this.runSync();
  }

  runSync() {
    const r = this.owner.statement(this.sql).run(...this.values);
    return { success: true as const, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

function toSql(v: unknown): SQLInputValue {
  if (v === undefined) throw new TypeError('D1_TYPE_ERROR: undefined is not a valid SQL value');
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v as SQLInputValue;
}

/**
 * Applies migrations/*.sql that haven't run yet, in name order, tracked in the same `d1_migrations`
 * table Wrangler uses — so a database exported from Cloudflare D1 imports cleanly and vice versa.
 */
export function applyMigrations(d1: SqliteD1, dir: string): string[] {
  const db = d1.db;
  db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const done = new Set((db.prepare('SELECT name FROM d1_migrations').all() as { name: string }[]).map((r) => r.name));
  const applied: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(readFileSync(join(dir, file), 'utf8'));
      db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(file);
      db.exec('COMMIT');
      applied.push(file);
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }
  return applied;
}
