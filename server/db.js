import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'itam.db');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));

// Additive migrations for databases created before a column existed.
function addColumn(table, column, definition, backfill) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (cols.includes(column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  if (backfill) db.exec(backfill);
}
addColumn('assets', 'received_date', 'TEXT',
  `UPDATE assets SET received_date = COALESCE(purchase_date, date(created_at))`);
addColumn('assets', 'holder_section', 'TEXT');
addColumn('documents', 'section', 'TEXT');
addColumn('asset_transactions', 'section', 'TEXT');
addColumn('stock_movements', 'section', 'TEXT');
addColumn('asset_transactions', 'doc_id', 'INTEGER REFERENCES documents(id)');
addColumn('stock_movements', 'doc_id', 'INTEGER REFERENCES documents(id)');
addColumn('stock_movements', 'received_date', 'TEXT',
  `UPDATE stock_movements SET received_date = date(created_at) WHERE type = 'in'`);

const cache = new Map();
function stmt(sql) {
  let s = cache.get(sql);
  if (!s) { s = db.prepare(sql); cache.set(sql, s); }
  return s;
}

const clean = (params) => params.map((p) => (p === undefined || p === '' ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));

export const all = (sql, ...p) => stmt(sql).all(...clean(p));
export const get = (sql, ...p) => stmt(sql).get(...clean(p));
export const run = (sql, ...p) => stmt(sql).run(...clean(p));

let depth = 0;
export function tx(fn) {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

export const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export function setting(key, fallback) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : fallback;
}
