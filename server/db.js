// Database access for both drivers, picked by DB_CLIENT in .env: sqlite (default, data/it_storage.db) or mssql.
// Queries are written once in SQLite syntax with ? placeholders; for SQL Server toTsql() rewrites the few
// differences (placeholders, LIMIT/OFFSET, COLLATE NOCASE, length(), Thai literals). Date math is done in JS
// and passed as parameters; the only dialect fragments left are ym() and localDate() below.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const CLIENT = String(process.env.DB_CLIENT || 'sqlite').toLowerCase() === 'mssql' ? 'mssql' : 'sqlite';
const MSSQL = CLIENT === 'mssql';
export const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'it_storage.db');

const clean = (params) => params.map((p) => (p === undefined || p === '' || Number.isNaN(p) ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));

/* ---------- dialect fragments ---------- */
// 'YYYY-MM' of a date/datetime expression
export const ym = (expr) => (MSSQL ? `CONVERT(char(7), ${expr}, 126)` : `strftime('%Y-%m', ${expr})`);
// UTC datetime column → server-local date
export const localDate = (expr) => (MSSQL
  ? `CAST(DATEADD(MINUTE, DATEDIFF(MINUTE, SYSUTCDATETIME(), SYSDATETIME()), ${expr}) AS DATE)`
  : `date(${expr}, 'localtime')`);
// date part of a datetime column (no timezone shift)
export const dateOf = (expr) => (MSSQL ? `CAST(${expr} AS DATE)` : `date(${expr})`);

/* ---------- drivers ---------- */
let driver;

if (MSSQL) {
  const { default: mssql } = await import('mssql');
  const flag = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));
  const config = {
    server: process.env.MSSQL_SERVER || 'localhost',
    port: Number(process.env.MSSQL_PORT || 1433),
    database: process.env.MSSQL_DATABASE || 'ITAM',
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    pool: { max: Number(process.env.MSSQL_POOL_MAX || 10), min: 0, idleTimeoutMillis: 30000 },
    options: {
      encrypt: flag(process.env.MSSQL_ENCRYPT, false),
      trustServerCertificate: flag(process.env.MSSQL_TRUST_CERT, true),
      instanceName: process.env.MSSQL_INSTANCE || undefined,
      useUTC: true,
      enableArithAbort: true,
    },
  };
  if (!config.user || !config.password) {
    throw new Error('DB_CLIENT=mssql needs MSSQL_USER and MSSQL_PASSWORD in .env (SQL Server login; Windows auth is not supported)');
  }
  const pool = new mssql.ConnectionPool(config);
  try {
    await pool.connect();
  } catch (e) {
    throw new Error(`Cannot connect to SQL Server ${config.server}:${config.port} database ${config.database} as ${config.user} — ${e.message}`);
  }

  const cache = new Map();
  const toTsql = (sql) => {
    let out = cache.get(sql);
    if (out) return out;
    let n = 0;
    // ? → @pN and Thai/other non-ASCII literals → N'...', skipping text inside quotes
    out = sql.replace(/'(?:[^']|'')*'|"[^"]*"|\?/g, (m) => {
      if (m === '?') return `@p${++n}`;
      return m[0] === "'" && /[^\x00-\x7f]/.test(m) ? `N${m}` : m;
    });
    out = out
      .replace(/\s+COLLATE\s+NOCASE\b/gi, '')
      .replace(/\blength\(/gi, 'LEN(')
      .replace(/\bLIMIT\s+(@p\d+|\d+)\s+OFFSET\s+(@p\d+|\d+)/gi, 'OFFSET $2 ROWS FETCH NEXT $1 ROWS ONLY')
      .replace(/\bLIMIT\s+(@p\d+|\d+)/gi, 'OFFSET 0 ROWS FETCH NEXT $1 ROWS ONLY');
    cache.set(sql, out);
    return out;
  };

  const DATE_TYPES = new Set([mssql.Date]);
  const DATETIME_TYPES = new Set([mssql.DateTime2, mssql.DateTime, mssql.SmallDateTime, mssql.DateTimeOffset]);
  // Return rows shaped like SQLite's: dates as 'YYYY-MM-DD' / 'YYYY-MM-DD HH:MM:SS' (UTC), booleans as 1/0.
  const shape = (recordset) => {
    if (!recordset?.length) return recordset || [];
    const cols = Object.values(recordset.columns || {});
    const dates = cols.filter((c) => DATE_TYPES.has(c.type)).map((c) => c.name);
    const times = cols.filter((c) => DATETIME_TYPES.has(c.type)).map((c) => c.name);
    const bits = cols.filter((c) => c.type === mssql.Bit).map((c) => c.name);
    for (const row of recordset) {
      for (const k of dates) if (row[k] instanceof Date) row[k] = row[k].toISOString().slice(0, 10);
      for (const k of times) if (row[k] instanceof Date) row[k] = row[k].toISOString().replace('T', ' ').slice(0, 19);
      for (const k of bits) if (typeof row[k] === 'boolean') row[k] = row[k] ? 1 : 0;
    }
    return recordset;
  };

  const bind = (request, params) => {
    params.forEach((v, i) => {
      const name = `p${i + 1}`;
      if (typeof v === 'number' && Number.isInteger(v)) request.input(name, Math.abs(v) < 2 ** 31 ? mssql.Int : mssql.BigInt, v);
      else if (typeof v === 'number') request.input(name, mssql.Float, v);
      else if (typeof v === 'bigint') request.input(name, mssql.BigInt, Number(v));
      else if (v === null) request.input(name, mssql.NVarChar, null);
      else request.input(name, mssql.NVarChar(mssql.MAX), String(v));
    });
    return request;
  };

  const store = new AsyncLocalStorage();
  const request = () => new mssql.Request(store.getStore()?.t || pool);

  driver = {
    async query(sql, params) {
      let text = toTsql(sql);
      const insert = /^\s*INSERT\b/i.test(text);
      if (insert) text += '; SELECT CAST(SCOPE_IDENTITY() AS BIGINT) AS __id';
      const result = await bind(request(), clean(params)).query(text);
      const sets = result.recordsets || [];
      return {
        rows: shape(insert ? [] : result.recordset),
        changes: result.rowsAffected?.[0] ?? 0,
        lastInsertRowid: insert ? Number(sets.at(-1)?.[0]?.__id ?? 0) || undefined : undefined,
      };
    },
    async tx(fn) {
      if (store.getStore()) return fn();
      const t = new mssql.Transaction(pool);
      await t.begin(mssql.ISOLATION_LEVEL.READ_COMMITTED);
      try {
        // One writer at a time, like SQLite's BEGIN IMMEDIATE, so tag/slip numbers and stock checks don't race.
        await new mssql.Request(t).query(`DECLARE @r INT;
          EXEC @r = sp_getapplock @Resource = 'itam_write', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000;
          IF @r < 0 THROW 50010, 'database busy', 1;`);
        const result = await store.run({ t }, fn);
        await t.commit();
        return result;
      } catch (e) {
        try { await t.rollback(); } catch { /* already rolled back */ }
        throw e;
      }
    },
    async exec(script) {
      for (const batch of script.split(/^\s*GO\s*$/im).map((b) => b.trim()).filter(Boolean)) await pool.request().batch(batch);
    },
    close: () => pool.close(),
  };
  await driver.exec(fs.readFileSync(path.join(here, 'schema.mssql.sql'), 'utf8'));
} else {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));

  // Additive migrations for databases created before a column existed.
  const addColumn = (table, column, definition, backfill) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (cols.includes(column)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    if (backfill) db.exec(backfill);
  };
  addColumn('assets', 'received_date', 'TEXT',
    `UPDATE assets SET received_date = COALESCE(purchase_date, date(created_at))`);
  addColumn('asset_transactions', 'doc_id', 'INTEGER REFERENCES documents(id)');
  addColumn('stock_movements', 'doc_id', 'INTEGER REFERENCES documents(id)');
  addColumn('stock_movements', 'received_date', 'TEXT',
    `UPDATE stock_movements SET received_date = date(created_at) WHERE type = 'in'`);
  addColumn('consumables', 'image_path', 'TEXT');
  addColumn('pending_receipts', 'deleted_at', 'TEXT');
  addColumn('pending_receipts', 'order_line_id', 'INTEGER REFERENCES order_lines(id)');
  addColumn('order_lines', 'unit_price', 'REAL');
  addColumn('pending_receipts', 'po_id', 'INTEGER REFERENCES purchase_orders(id)');
  // Indexes on migrated columns go here, after the column is guaranteed to exist.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_atx_doc ON asset_transactions(doc_id) WHERE doc_id IS NOT NULL;
           CREATE INDEX IF NOT EXISTS idx_sm_doc ON stock_movements(doc_id) WHERE doc_id IS NOT NULL;
           CREATE INDEX IF NOT EXISTS idx_pending_po ON pending_receipts(po_id) WHERE po_id IS NOT NULL;`);

  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = db.prepare(sql); cache.set(sql, s); }
    return s;
  };
  const store = new AsyncLocalStorage();

  driver = {
    async query(sql, params) {
      const s = stmt(sql);
      if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql)) return { rows: s.all(...clean(params)) };
      const info = s.run(...clean(params));
      return { rows: [], changes: Number(info.changes), lastInsertRowid: Number(info.lastInsertRowid) };
    },
    async tx(fn) {
      if (store.getStore()) return fn();
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = await store.run({}, fn);
        db.exec('COMMIT');
        return result;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async exec(script) { db.exec(script); },
    close: async () => db.close(),
    sqlite: db,
  };
}

export const all = async (sql, ...p) => (await driver.query(sql, p)).rows;
export const get = async (sql, ...p) => (await driver.query(sql, p)).rows[0];
export const run = async (sql, ...p) => {
  const { changes = 0, lastInsertRowid } = await driver.query(sql, p);
  return { changes, lastInsertRowid };
};
// Runs fn (async) in one transaction; nested calls join the outer one.
export const tx = (fn) => driver.tx(fn);
export const exec = (script) => driver.exec(script);
export const closeDb = () => driver.close();
export const sqliteHandle = () => driver.sqlite;

const stamp = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
export const now = () => stamp(Date.now());
// UTC timestamp `minutes` ago, same format as now(), for comparing with created_at / last_seen
export const minutesAgo = (minutes) => stamp(Date.now() - minutes * 60000);

export async function setting(key, fallback) {
  const row = await get('SELECT value FROM settings WHERE "key" = ?', key);
  return row ? row.value : fallback;
}

// SQL Server only: drop every table (seed uses this to start from an empty database), then recreate the schema.
export async function resetMssql() {
  if (!MSSQL) throw new Error('resetMssql() is for DB_CLIENT=mssql');
  await driver.exec(`DECLARE @s NVARCHAR(MAX) = N'';
    SELECT @s += N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(parent_object_id)) + N'.' + QUOTENAME(OBJECT_NAME(parent_object_id))
               + N' DROP CONSTRAINT ' + QUOTENAME(name) + N';' FROM sys.foreign_keys;
    SELECT @s += N'DROP TABLE ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name) + N';' FROM sys.tables WHERE is_ms_shipped = 0;
    EXEC sp_executesql @s;`);
  await driver.exec(fs.readFileSync(path.join(here, 'schema.mssql.sql'), 'utf8'));
}
