// Loads opening consumable stock (ยอดยกมา) from inventory CSV exports into data/it_storage.db.
// Usage: npm run import-stock -- file1.csv [file2.csv ...]
// Columns: ID,Barcode,Name,Quantity,Min Stock,Unit Price,Total Value,Location,Category
// Barcode becomes the SKU. Rows whose SKU already exists are skipped, so re-running is safe.
import './env.js';
import fs from 'node:fs';

const { run, get, tx, now } = await import('./db.js');
const { bootstrap } = await import('./bootstrap.js');
const { audit } = await import('./audit.js');

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: npm run import-stock -- file1.csv [file2.csv ...]');
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim()));
}

const readRows = (file) => {
  const [header, ...body] = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const col = (name) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const idx = { sku: col('barcode'), name: col('name'), qty: col('quantity'), min: col('min stock'), price: col('unit price'), loc: col('location'), cat: col('category') };
  for (const [k, i] of Object.entries(idx)) if (i < 0) throw new Error(`${file}: missing column for ${k}`);
  return body.map((r, n) => ({
    line: n + 2, file,
    sku: r[idx.sku].trim(), name: r[idx.name].trim().replace(/\s+/g, ' '),
    qty: Number(r[idx.qty]) || 0, min: Number(r[idx.min]) || 0, price: Number(r[idx.price]) || 0,
    loc: r[idx.loc].trim(), cat: r[idx.cat].trim().replace(/\s+/g, ' ') || 'อื่นๆ',
  }));
};

bootstrap();
const admin = get(`SELECT id, username FROM users WHERE username = 'admin'`) || get('SELECT id, username FROM users ORDER BY id LIMIT 1');
const req = { user: admin, headers: {}, socket: { remoteAddress: 'import-stock' } };

function categoryId(name) {
  const hit = get(`SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND kind = 'consumable' AND deleted_at IS NULL`, name);
  if (hit) return hit.id;
  const base = (name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'CON').padEnd(2, 'X');
  let prefix = base, n = 1;
  while (get('SELECT 1 FROM categories WHERE prefix = ?', prefix)) prefix = `${base.slice(0, 5)}${n++}`;
  const id = Number(run(`INSERT INTO categories (name, kind, prefix) VALUES (?, 'consumable', ?)`, name, prefix).lastInsertRowid);
  audit(req, 'category', id, 'create', null, { name, kind: 'consumable', prefix });
  return id;
}

function locationId(name) {
  if (!name) return null;
  const hit = get('SELECT id FROM locations WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL', name);
  if (hit) return hit.id;
  const id = Number(run('INSERT INTO locations (name) VALUES (?)', name).lastInsertRowid);
  audit(req, 'location', id, 'create', null, { name });
  return id;
}

const rows = files.flatMap(readRows);
const today = now().slice(0, 10);
let added = 0, skipped = 0;

tx(() => {
  const seen = new Set();
  for (const r of rows) {
    const where = `${r.file}:${r.line}`;
    if (!r.sku || r.sku.length > 64 || /\s/.test(r.sku)) throw new Error(`${where}: invalid barcode "${r.sku}"`);
    if (!r.name) throw new Error(`${where}: missing name`);
    if (!Number.isInteger(r.qty) || r.qty < 0) throw new Error(`${where}: invalid quantity`);
    const key = r.sku.toLowerCase();
    if (seen.has(key)) throw new Error(`${where}: barcode ${r.sku} appears twice in the import`);
    seen.add(key);
    if (get('SELECT 1 FROM consumables WHERE sku = ? COLLATE NOCASE', r.sku)) { skipped++; console.log(`  skip  ${r.sku}  ${r.name} (SKU exists)`); continue; }

    const unitCost = r.price > 0 ? r.price : null;
    const id = Number(run(`INSERT INTO consumables (sku, category_id, name, unit, qty_on_hand, reorder_point, location_id, unit_cost)
      VALUES (?, ?, ?, 'ชิ้น', ?, ?, ?, ?)`, r.sku, categoryId(r.cat), r.name, r.qty, r.min, locationId(r.loc), unitCost).lastInsertRowid);
    if (r.qty > 0) {
      run(`INSERT INTO stock_movements (consumable_id, type, qty, balance_after, unit_cost, received_date, note, performed_by)
        VALUES (?, 'in', ?, ?, ?, ?, 'ยอดยกมา', ?)`, id, r.qty, r.qty, unitCost, today, admin.id);
    }
    audit(req, 'consumable', id, 'create', null, get('SELECT * FROM consumables WHERE id = ?', id));
    added++;
  }
});

console.log(`Imported ${added} consumables, skipped ${skipped} existing.`);
