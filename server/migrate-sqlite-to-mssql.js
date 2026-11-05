// Copies an existing SQLite database into the SQL Server database from .env (DB_CLIENT=mssql), keeping ids.
// Usage: npm run migrate:mssql -- [data/it_storage.db] [--replace] [--dry-run]
//   The SQLite file is opened read-only. Sessions are not copied (everyone logs in again).
//   The target must hold no users/items yet; --replace drops and recreates every table first.
//   All rows are copied in one transaction: an error rolls the copy back, leaving the (recreated) tables empty — fix and re-run.
import './env.js';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const args = process.argv.slice(2);
const replace = args.includes('--replace');
const dryRun = args.includes('--dry-run');
const src = path.resolve(args.find((a) => !a.startsWith('--')) || process.env.DB_PATH || 'data/it_storage.db');
if (!fs.existsSync(src)) { console.error(`SQLite file not found: ${src}`); process.exit(1); }
if (String(process.env.DB_CLIENT).toLowerCase() !== 'mssql') { console.error('Set DB_CLIENT=mssql (and MSSQL_*) in .env first'); process.exit(1); }

const { all, get, run, tx, resetMssql, closeDb } = await import('./db.js');

// Parents before children (foreign keys).
const ORDER = ['settings', 'permissions', 'roles', 'role_permissions', 'departments', 'locations', 'categories', 'vendors', 'people',
  'users', 'documents', 'assets', 'consumables', 'asset_transactions', 'stock_movements', 'stock_counts', 'stock_count_scans',
  'pending_batches', 'pending_receipts', 'orders', 'order_lines', 'audit_logs', 'access_logs'];
const DATA_TABLES = ['users', 'assets', 'consumables', 'stock_movements', 'asset_transactions', 'documents', 'people', 'departments', 'categories'];

const lite = new DatabaseSync(src, { readOnly: true });
const liteTables = new Set(lite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name));

const plan = [];
for (const table of ORDER) {
  if (!liteTables.has(table)) continue;
  const srcCols = lite.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
  const dstCols = new Map((await all(`SELECT c.name, c.is_identity FROM sys.columns c WHERE c.object_id = OBJECT_ID(?)`, `dbo.${table}`))
    .map((c) => [c.name, c.is_identity]));
  const cols = srcCols.filter((c) => dstCols.has(c));
  const dropped = srcCols.filter((c) => !dstCols.has(c));
  const rows = lite.prepare(`SELECT ${cols.map((c) => `"${c}"`).join(', ')} FROM "${table}"`).all();
  plan.push({ table, cols, dropped, rows, identity: cols.some((c) => dstCols.get(c)) });
}

console.log(`Source: ${src}`);
console.log(`Target: SQL Server ${process.env.MSSQL_SERVER || 'localhost'}:${process.env.MSSQL_PORT || 1433} / ${process.env.MSSQL_DATABASE || 'ITAM'}\n`);
for (const p of plan) console.log(`  ${p.table.padEnd(20)} ${String(p.rows.length).padStart(6)} rows${p.dropped.length ? `   (old columns not copied: ${p.dropped.join(', ')})` : ''}`);

const existing = [];
for (const t of DATA_TABLES) {
  const n = (await get(`SELECT COUNT(*) n FROM ${t}`)).n;
  if (n) existing.push(`${t}=${n}`);
}
if (dryRun) { console.log(`\nDry run — nothing written.${existing.length ? ` Target already has: ${existing.join(', ')}` : ''}`); await closeDb(); process.exit(0); }
if (existing.length && !replace) {
  console.error(`\nTarget already has data (${existing.join(', ')}). Re-run with --replace to drop and recreate every table first.`);
  await closeDb();
  process.exit(1);
}

// Start from empty tables: drop + recreate (also clears append-only logs, which DELETE cannot).
await resetMssql();

await tx(async () => {
  for (const { table, cols, rows, identity } of plan) {
    if (!rows.length) continue;
    // IDENTITY_INSERT must sit in the same batch: a SET inside sp_executesql ends with that call.
    const insert = `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
    const sql = identity ? `SET IDENTITY_INSERT ${table} ON; ${insert}; SET IDENTITY_INSERT ${table} OFF` : insert;
    for (const [i, row] of rows.entries()) {
      try {
        await run(sql, ...cols.map((c) => row[c]));
      } catch (e) {
        throw new Error(`${table} row ${i + 1} (id ${row.id ?? row.key ?? '?'}): ${e.message}`);
      }
    }
  }
});

// Verify
let ok = true;
console.log('');
for (const { table, rows } of plan) {
  const n = (await get(`SELECT COUNT(*) n FROM ${table}`)).n;
  if (n !== rows.length) ok = false;
  console.log(`  ${n === rows.length ? 'ok  ' : 'DIFF'} ${table.padEnd(20)} ${n} / ${rows.length}`);
}
await closeDb();
lite.close();
console.log(ok ? '\nDone — data copied. Uploaded files stay in data/uploads/ (same paths).' : '\nRow counts differ — check the table(s) marked DIFF.');
process.exit(ok ? 0 : 1);
