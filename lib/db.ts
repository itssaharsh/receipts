import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA_SQL } from './schema';

type Params = unknown[];
type Row = Record<string, unknown>;

/** node:sqlite hands back rows with a null prototype; React cannot pass those from a server component to the client, so every row is copied into a plain object here. */
const plain = <T,>(r: T): T => (r && typeof r === 'object' ? (Object.assign({}, r as Row) as T) : r);

export type Statement = {
  run: (...params: Params) => { changes: number | bigint; lastInsertRowid: number | bigint };
  get: <T = Row>(...params: Params) => T | undefined;
  all: <T = Row>(...params: Params) => T[];
};

/**
 * The one handle the app uses over Node's built-in SQLite (no native module to build; the same file format as any
 * SQLite tool). prepare/run/get/all/exec/close, the subset the store and the trace need.
 */
export class Db {
  constructor(private readonly raw: DatabaseSync) {}

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  prepare(sql: string): Statement {
    const st = this.raw.prepare(sql);
    type Bind = Parameters<typeof st.run>;
    return {
      run: (...params) => st.run(...(params as Bind)),
      get: <T,>(...params: Params) => plain(st.get(...(params as Bind)) as T | undefined),
      all: <T,>(...params: Params) => (st.all(...(params as Bind)) as T[]).map(plain),
    };
  }

  close(): void {
    this.raw.close();
  }
}

/** Open (or create) the SQLite file at `file` and apply the schema. ':memory:' gives a fresh in-memory database. */
export function openDb(file: string = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'receipts.db')): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  if (file !== ':memory:') raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec(SCHEMA_SQL);
  return new Db(raw);
}

type GlobalWithDb = typeof globalThis & { __receiptsDb?: Db; __receiptsDbPath?: string };

/** One shared connection per process (survives Next dev hot reloads via globalThis). */
export function getDb(): Db {
  const g = globalThis as GlobalWithDb;
  const wanted = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'receipts.db');
  if (!g.__receiptsDb || !(g.__receiptsDb instanceof Db) || g.__receiptsDbPath !== wanted) {
    g.__receiptsDb = openDb(wanted);
    g.__receiptsDbPath = wanted;
  }
  return g.__receiptsDb;
}

export function nowISO(): string {
  return new Date().toISOString();
}
