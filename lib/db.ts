import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA_SQL } from './schema';

export type Db = Database.Database;

/** Open (or create) the SQLite file at `file` and apply the schema. ':memory:' gives a fresh in-memory database. */
export function openDb(file: string = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'receipts.db')): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  if (file !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  return db;
}

type GlobalWithDb = typeof globalThis & { __receiptsDb?: Db; __receiptsDbPath?: string };

/** One shared connection per process (survives Next dev hot reloads via globalThis). */
export function getDb(): Db {
  const g = globalThis as GlobalWithDb;
  const wanted = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'receipts.db');
  if (!g.__receiptsDb || g.__receiptsDbPath !== wanted) {
    g.__receiptsDb = openDb(wanted);
    g.__receiptsDbPath = wanted;
  }
  return g.__receiptsDb;
}

export function nowISO(): string {
  return new Date().toISOString();
}
