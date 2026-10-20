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

// before = current row when editing. Names must be unique (case-insensitive) because recipients
// and imports link to master rows by typed name; only checked when the name actually changes.
function validate(table, body, before = null) {
  const def = TABLES[table];
  for (const f of def.required) if (!String(body[f] ?? '').trim()) throw bad(`กรุณากรอก ${f === 'name' ? 'ชื่อ' : f}`);
  body.name = String(body.name).trim().replace(/\s+/g, ' ');
  if (!before || body.name.toLowerCase() !== String(before.name).toLowerCase()) {
    const dup = get(`SELECT id FROM ${table} WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL AND id IS NOT ?`, body.name, before?.id ?? null);
    if (dup) throw bad(`มี${def.label}ชื่อ "${body.name}" อยู่แล้ว — ใช้ชื่ออื่น หรือแก้ไขรายการเดิม`);
  }
  if (table === 'people') {
    const code = String(body.emp_code ?? '').trim();
    body.emp_code = code || null;
    if (code && code !== (before?.emp_code ?? '')) {
      const other = get('SELECT name FROM people WHERE emp_code = ? COLLATE NOCASE AND deleted_at IS NULL AND id IS NOT ?', code, before?.id ?? null);
      if (other) throw bad(`รหัสพนักงาน ${code} ซ้ำกับ "${other.name}" — ตรวจสอบรหัสแล้วลองใหม่`);
    }
    const dept = body.department_id === '' || body.department_id == null ? null : Number(body.department_id);
    if (dept !== null && !get('SELECT id FROM departments WHERE id = ? AND deleted_at IS NULL', dept)) {
      throw bad('ไม่พบแผนกที่เลือก (อาจถูกลบไปแล้ว) — เลือกแผนกใหม่');
    }
    body.department_id = dept;
  }
  if (body.email !== undefined && body.email !== null && String(body.email).trim()
    && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email).trim())) {
    throw bad('รูปแบบอีเมลไม่ถูกต้อง เช่น name@company.com');
  }
  if (table === 'categories') {
    if (!['asset', 'consumable'].includes(body.kind)) throw bad('ประเภทหมวดหมู่ต้องเป็น อุปกรณ์ หรือ วัสดุสิ้นเปลือง');
    if (!/^[A-Z0-9]{2,6}$/.test(String(body.prefix).toUpperCase())) throw bad('Prefix ต้องเป็นตัวอักษรอังกฤษ/ตัวเลข 2–6 ตัว เช่น NB, MON');
    body.prefix = String(body.prefix).toUpperCase();
  }
  return def.fields.map((f) => (typeof body[f] === 'string' ? body[f].trim() : body[f]));
}

const r = Router();

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
  const values = validate(table, { ...before, ...req.body }, before);
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

function softDelete(req, table, before) {
  const { id } = before;
  if (table === 'categories') {
    const used = get(LIST_SQL.categories + ' AND c.id = ?', id).usage;
    if (used) throw bad(`ลบ "${before.name}" ไม่ได้ เพราะยังมีรายการ ${used} รายการในหมวดนี้ — ย้ายรายการไปหมวดอื่นก่อน`);
  }
  if (table === 'people') {
    const held = get(`SELECT COUNT(*) n FROM assets WHERE holder_person_id = ? AND status IN ('borrowed','issued') AND deleted_at IS NULL`, id).n;
    if (held) throw bad(`ลบไม่ได้ เพราะ ${before.name} ยังถือครองอุปกรณ์ ${held} รายการ — รับคืนหรือโอนย้ายก่อน`);
  }
  run(`UPDATE ${table} SET deleted_at = ? WHERE id = ?`, now(), id);
  audit(req, table, id, 'delete', before, null);
}

r.delete('/:table/:id', requirePerm('master.manage'), (req, res) => {
  const { table, id } = req.params;
  const def = TABLES[table];
  if (!def) throw notFound('ตาราง');
  const before = get(`SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`, id);
  if (!before) throw notFound(def.label);
  tx(() => softDelete(req, table, before));
  res.json({ ok: true });
});

// Bulk action on checked rows, all-or-nothing: { ids, action: 'delete' } | { ids, action: 'set', field, value }.
// Only non-unique fields can be bulk-set (e.g. a person's department).
const BULK_SET = { people: ['department_id'], locations: ['branch'] };

r.post('/:table/bulk', requirePerm('master.manage'), (req, res) => {
  const { table } = req.params;
  const def = TABLES[table];
  if (!def) throw notFound('ตาราง');
  const { action, field, value } = req.body || {};
  const ids = [...new Set((req.body?.ids || []).map(Number).filter(Number.isInteger))];
  if (!ids.length) throw bad('กรุณาเลือกอย่างน้อย 1 รายการ');
  if (ids.length > 500) throw bad('เลือกได้ครั้งละไม่เกิน 500 รายการ');
  if (action === 'set' && !BULK_SET[table]?.includes(field)) throw bad('แก้ไขพร้อมกันได้เฉพาะบางช่องเท่านั้น');
  if (!['delete', 'set'].includes(action)) throw bad('คำสั่งไม่ถูกต้อง');

  tx(() => {
    for (const id of ids) {
      const before = get(`SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`, id);
      if (!before) throw bad(`ไม่พบ${def.label}บางรายการ (อาจถูกลบไปแล้ว) — โหลดหน้าใหม่แล้วลองอีกครั้ง`);
      if (action === 'delete') { softDelete(req, table, before); continue; }
      const values = validate(table, { ...before, [field]: value }, before);
      run(`UPDATE ${table} SET ${def.fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, ...values, id);
      audit(req, table, id, 'update', before, get(`SELECT * FROM ${table} WHERE id = ?`, id));
    }
  });
  res.json({ ok: true, count: ids.length });
});

export default r;
