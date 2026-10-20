import { Router } from 'express';
import { all, get, run, now, tx } from '../db.js';
import { requirePerm, requireAuth } from '../auth.js';
import { audit } from '../audit.js';
import { bad, notFound, likeTerm } from './util.js';

// Generic soft-delete CRUD for small lookup tables.
const TABLES = {
  departments: { label: 'แผนก', fields: ['name'], required: ['name'] },
  locations: { label: 'สถานที่', fields: ['name', 'branch'], required: ['name'] },
  vendors: { label: 'ผู้ขาย', fields: ['name', 'contact', 'phone', 'email'], required: ['name'] },
  categories: { label: 'หมวดหมู่', fields: ['name', 'kind', 'prefix'], required: ['name', 'kind', 'prefix'] },
  people: { label: 'พนักงาน', fields: ['emp_code', 'name', 'department_id', 'email', 'phone'], required: ['name'] },
};

const LIST_SQL = {
  people: `SELECT p.*, d.name AS department_name FROM people p LEFT JOIN departments d ON d.id = p.department_id WHERE p.deleted_at IS NULL`,
  categories: `SELECT c.*,
      (SELECT COUNT(*) FROM assets a WHERE a.category_id = c.id AND a.deleted_at IS NULL) +
      (SELECT COUNT(*) FROM consumables x WHERE x.category_id = c.id AND x.deleted_at IS NULL) AS usage
    FROM categories c WHERE c.deleted_at IS NULL`,
};

function validate(table, body) {
  const def = TABLES[table];
  for (const f of def.required) if (!String(body[f] ?? '').trim()) throw bad(`กรุณากรอก ${f === 'name' ? 'ชื่อ' : f}`);
  if (table === 'categories') {
    if (!['asset', 'consumable'].includes(body.kind)) throw bad('ประเภทหมวดหมู่ต้องเป็น อุปกรณ์ หรือ วัสดุสิ้นเปลือง');
    if (!/^[A-Z0-9]{2,6}$/.test(String(body.prefix).toUpperCase())) throw bad('Prefix ต้องเป็นตัวอักษรอังกฤษ/ตัวเลข 2–6 ตัว เช่น NB, MON');
    body.prefix = String(body.prefix).toUpperCase();
  }
  return def.fields.map((f) => (typeof body[f] === 'string' ? body[f].trim() : body[f]));
}

const r = Router();

// Distinct sections already used, for autocomplete (sections are free text, not a lookup table).
r.get('/sections', requireAuth, (req, res) => {
  res.json({ rows: all(`SELECT name FROM (
      SELECT section AS name FROM documents UNION SELECT section FROM asset_transactions
      UNION SELECT section FROM stock_movements UNION SELECT holder_section FROM assets
    ) WHERE name IS NOT NULL AND name <> '' ORDER BY name COLLATE NOCASE LIMIT 500`).map((x) => x.name) });
});

r.get('/:table', requireAuth, (req, res) => {
  const { table } = req.params;
  if (!TABLES[table]) throw notFound('ตาราง');
  let sql = LIST_SQL[table] || `SELECT * FROM ${table} WHERE deleted_at IS NULL`;
  const params = [];
  if (req.query.kind && table === 'categories') { sql += ' AND c.kind = ?'; params.push(req.query.kind); }
  if (req.query.q) {
    const alias = table === 'people' ? 'p.' : table === 'categories' ? 'c.' : '';
    sql += ` AND (${alias}name LIKE ? ESCAPE '\\'${table === 'people' ? " OR p.emp_code LIKE ? ESCAPE '\\'" : ''})`;
    params.push(likeTerm(req.query.q));
    if (table === 'people') params.push(likeTerm(req.query.q));
  }
  sql += ' ORDER BY name COLLATE NOCASE';
  res.json({ rows: all(sql, ...params) });
});

r.post('/:table', requirePerm('master.manage'), (req, res) => {
  const { table } = req.params;
  const def = TABLES[table];
  if (!def) throw notFound('ตาราง');
  const values = validate(table, req.body || {});
  const id = tx(() => {
    const info = run(`INSERT INTO ${table} (${def.fields.join(',')}) VALUES (${def.fields.map(() => '?').join(',')})`, ...values);
    const row = get(`SELECT * FROM ${table} WHERE id = ?`, info.lastInsertRowid);
    audit(req, table, row.id, 'create', null, row);
    return row.id;
  });
  res.status(201).json(get(`SELECT * FROM ${table} WHERE id = ?`, id));
});

r.put('/:table/:id', requirePerm('master.manage'), (req, res) => {
  const { table, id } = req.params;
  const def = TABLES[table];
  if (!def) throw notFound('ตาราง');
  const before = get(`SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`, id);
  if (!before) throw notFound(def.label);
  const values = validate(table, { ...before, ...req.body });
  if (table === 'categories' && req.body.kind && req.body.kind !== before.kind) {
    const used = get(LIST_SQL.categories + ' AND c.id = ?', id).usage;
    if (used) throw bad(`เปลี่ยนวิธีติดตามไม่ได้ เพราะมี ${used} รายการในหมวดนี้ — สร้างหมวดใหม่แทน`);
  }
  tx(() => {
    run(`UPDATE ${table} SET ${def.fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, ...values, id);
    audit(req, table, Number(id), 'update', before, get(`SELECT * FROM ${table} WHERE id = ?`, id));
  });
  res.json(get(`SELECT * FROM ${table} WHERE id = ?`, id));
});

r.delete('/:table/:id', requirePerm('master.manage'), (req, res) => {
  const { table, id } = req.params;
  const def = TABLES[table];
  if (!def) throw notFound('ตาราง');
  const before = get(`SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`, id);
  if (!before) throw notFound(def.label);
  if (table === 'categories') {
    const used = get(LIST_SQL.categories + ' AND c.id = ?', id).usage;
    if (used) throw bad(`ลบไม่ได้ เพราะยังมีรายการ ${used} รายการในหมวดนี้ — ย้ายรายการไปหมวดอื่นก่อน`);
  }
  tx(() => {
    run(`UPDATE ${table} SET deleted_at = ? WHERE id = ?`, now(), id);
    audit(req, table, Number(id), 'delete', before, null);
  });
  res.json({ ok: true });
});

export default r;
