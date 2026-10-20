import { Router } from 'express';
import ExcelJS from 'exceljs';
import { all, get, run, now, tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { audit } from '../audit.js';
import { resolveRecipient } from '../recipient.js';
import { bad, notFound, paging, likeTerm, toNum, toInt, isDate, today } from './util.js';

const r = Router();

export const SELECT = `
  SELECT x.*, c.name AS category_name, l.name AS location_name, v.name AS vendor_name,
         (x.qty_on_hand <= x.reorder_point) AS is_low
  FROM consumables x
  JOIN categories c ON c.id = x.category_id
  LEFT JOIN locations l ON l.id = x.location_id
  LEFT JOIN vendors v ON v.id = x.vendor_id`;

const FIELDS = ['category_id', 'name', 'unit', 'reorder_point', 'location_id', 'unit_cost', 'vendor_id', 'notes'];

function normalize(body) {
  const v = {};
  for (const f of FIELDS) v[f] = typeof body[f] === 'string' ? body[f].trim() : body[f];
  if (!v.name) throw bad('กรุณากรอกชื่อวัสดุ');
  v.category_id = toInt(v.category_id);
  const cat = get(`SELECT * FROM categories WHERE id = ? AND kind = 'consumable' AND deleted_at IS NULL`, v.category_id);
  if (!cat) throw bad('กรุณาเลือกหมวดหมู่ประเภทวัสดุสิ้นเปลือง');
  v.unit = v.unit || 'ชิ้น';
  v.reorder_point = toInt(v.reorder_point) ?? 0;
  if (v.reorder_point < 0) throw bad('จุดสั่งซื้อต้องไม่ติดลบ');
  v.unit_cost = toNum(v.unit_cost);
  v.location_id = toInt(v.location_id);
  v.vendor_id = toInt(v.vendor_id);
  return { v, cat };
}

function checkReceived(d) {
  if (!d) return today();
  if (!isDate(d)) throw bad('รูปแบบวันที่รับเข้าไม่ถูกต้อง');
  if (d > today()) throw bad('วันที่รับเข้าต้องไม่เป็นวันในอนาคต');
  return d;
}

function nextSku(prefix) {
  const base = `C-${prefix}-`;
  const row = get('SELECT sku FROM consumables WHERE sku LIKE ? ORDER BY sku DESC LIMIT 1', base + '%');
  return base + String(row ? parseInt(row.sku.slice(base.length), 10) + 1 : 1).padStart(4, '0');
}

function where(q) {
  const w = ['x.deleted_at IS NULL'];
  const p = [];
  if (q.q) { w.push(`(x.name LIKE ? ESCAPE '\\' OR x.sku LIKE ? ESCAPE '\\')`); p.push(likeTerm(q.q), likeTerm(q.q)); }
  if (q.category_id) { w.push('x.category_id = ?'); p.push(q.category_id); }
  if (q.low === '1') w.push('x.qty_on_hand <= x.reorder_point');
  return { sql: w.join(' AND '), p };
}

r.get('/', requirePerm('consumable.view'), (req, res) => {
  const { page, pageSize, offset } = paging(req);
  const { sql, p } = where(req.query);
  const total = get(`SELECT COUNT(*) n FROM consumables x WHERE ${sql}`, ...p).n;
  const rows = all(`${SELECT} WHERE ${sql} ORDER BY is_low DESC, x.name COLLATE NOCASE LIMIT ? OFFSET ?`, ...p, pageSize, offset);
  res.json({ rows, total, page, pageSize });
});

r.get('/export', requirePerm('report.export'), async (req, res, next) => {
  try {
    const rows = all(`${SELECT} WHERE x.deleted_at IS NULL ORDER BY x.sku`);
    const wb = new ExcelJS.Workbook();
    addConsumableSheets(wb, rows);
    audit(req, 'consumable', null, 'export', null, { count: rows.length });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="consumables-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

export function addConsumableSheets(wb, rows) {
    const ws = wb.addWorksheet('วัสดุสิ้นเปลือง');
    ws.columns = [['SKU', 'sku', 14], ['ชื่อ', 'name', 30], ['หมวดหมู่', 'category_name', 16], ['คงเหลือ', 'qty_on_hand', 10], ['หน่วย', 'unit', 8],
      ['จุดสั่งซื้อ', 'reorder_point', 10], ['ราคา/หน่วย', 'unit_cost', 12], ['สถานที่', 'location_name', 18], ['ผู้ขาย', 'vendor_name', 18]]
      .map(([header, key, width]) => ({ header, key, width }));
    ws.getRow(1).font = { bold: true };
    rows.forEach((row) => ws.addRow(row));
    const mv = wb.addWorksheet('ความเคลื่อนไหว');
    mv.columns = [['วันที่บันทึก (UTC)', 'created_at', 20], ['วันที่รับเข้า', 'received_date', 12], ['SKU', 'sku', 14], ['ชื่อ', 'name', 28], ['ประเภท', 'type', 10], ['จำนวน', 'qty', 10],
      ['คงเหลือหลังทำรายการ', 'balance_after', 14], ['ผู้รับ', 'person_name', 20], ['แผนก', 'department_name', 16], ['หมายเหตุ', 'note', 24], ['ผู้ทำรายการ', 'by', 18]]
      .map(([header, key, width]) => ({ header, key, width }));
    mv.getRow(1).font = { bold: true };
    all(`SELECT m.*, x.sku, x.name, p.name person_name, d.name department_name, u.full_name "by" FROM stock_movements m
         JOIN consumables x ON x.id = m.consumable_id LEFT JOIN people p ON p.id = m.person_id
         LEFT JOIN departments d ON d.id = m.department_id LEFT JOIN users u ON u.id = m.performed_by ORDER BY m.created_at DESC`)
      .forEach((row) => mv.addRow({ ...row, type: { in: 'รับเข้า', out: 'เบิก', adjust: 'ปรับยอด' }[row.type] }));
}

r.get('/:id', requirePerm('consumable.view'), (req, res) => {
  const item = get(`${SELECT} WHERE x.id = ? AND x.deleted_at IS NULL`, req.params.id);
  if (!item) throw notFound('วัสดุ');
  const movements = all(`
    SELECT m.*, p.name AS person_name, d.name AS department_name, u.full_name AS performed_by_name,
           (SELECT doc_no FROM documents WHERE id = m.doc_id) AS doc_no,
           (SELECT doc_date FROM documents WHERE id = m.doc_id) AS doc_date
    FROM stock_movements m LEFT JOIN people p ON p.id = m.person_id LEFT JOIN departments d ON d.id = m.department_id
    LEFT JOIN users u ON u.id = m.performed_by WHERE m.consumable_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT 200`, item.id);
  const usage = all(`SELECT strftime('%Y-%m', COALESCE(d.doc_date, m.created_at)) ym, SUM(m.qty) qty FROM stock_movements m
    LEFT JOIN documents d ON d.id = m.doc_id
    WHERE m.consumable_id = ? AND m.type = 'out' AND COALESCE(d.doc_date, m.created_at) >= date('now','-6 months') GROUP BY ym ORDER BY ym`, item.id);
  res.json({ item, movements, usage });
});

r.post('/', requirePerm('consumable.manage'), (req, res) => {
  const { v, cat } = normalize(req.body || {});
  const initial = toInt(req.body.qty_on_hand) || 0;
  if (initial < 0) throw bad('จำนวนเริ่มต้นต้องไม่ติดลบ');
  const received = checkReceived(req.body.received_date);
  const id = tx(() => {
    const info = run(`INSERT INTO consumables (sku, ${FIELDS.join(',')}, qty_on_hand) VALUES (?, ${FIELDS.map(() => '?').join(',')}, ?)`,
      nextSku(cat.prefix), ...FIELDS.map((f) => v[f]), initial);
    const newId = Number(info.lastInsertRowid);
    if (initial > 0) {
      run(`INSERT INTO stock_movements (consumable_id, type, qty, balance_after, unit_cost, received_date, note, performed_by) VALUES (?, 'in', ?, ?, ?, ?, 'ยอดยกมา', ?)`,
        newId, initial, initial, v.unit_cost, received, req.user.id);
    }
    audit(req, 'consumable', newId, 'create', null, get('SELECT * FROM consumables WHERE id = ?', newId));
    return newId;
  });
  res.status(201).json(get(`${SELECT} WHERE x.id = ?`, id));
});

r.put('/:id', requirePerm('consumable.manage'), (req, res) => {
  const before = get('SELECT * FROM consumables WHERE id = ? AND deleted_at IS NULL', req.params.id);
  if (!before) throw notFound('วัสดุ');
  const { v } = normalize({ ...before, ...req.body });
  tx(() => {
    run(`UPDATE consumables SET ${FIELDS.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...FIELDS.map((f) => v[f]), now(), before.id);
    audit(req, 'consumable', before.id, 'update', before, get('SELECT * FROM consumables WHERE id = ?', before.id));
  });
  res.json(get(`${SELECT} WHERE x.id = ?`, before.id));
});

r.delete('/:id', requirePerm('consumable.manage'), (req, res) => {
  const before = get('SELECT * FROM consumables WHERE id = ? AND deleted_at IS NULL', req.params.id);
  if (!before) throw notFound('วัสดุ');
  tx(() => {
    run('UPDATE consumables SET deleted_at = ? WHERE id = ?', now(), before.id);
    audit(req, 'consumable', before.id, 'delete', before, null);
  });
  res.json({ ok: true });
});

// type: in (รับเข้า, qty > 0) | out (เบิก, qty > 0) | adjust (ตั้งยอดใหม่ = qty)
r.post('/:id/move', requirePerm('consumable.move'), (req, res) => {
  res.json(moveStock(req, req.params.id, req.body || {}));
});

// Shared by the move route and receive/issue documents.
export function moveStock(req, consumableId, input, docId = null) {
  const { type, note } = input;
  const qty = toInt(input.qty);
  // Recipient is optional for a plain stock-out, but if given it is resolved the same way as for assets.
  const { person_id, department_id } = type === 'out'
    ? resolveRecipient(req, input, { required: false })
    : { person_id: null, department_id: null };
  const unit_cost = toNum(input.unit_cost);
  if (!['in', 'out', 'adjust'].includes(type)) throw bad('ประเภทรายการไม่ถูกต้อง');
  if (qty === null || Number.isNaN(qty) || qty < 0 || (type !== 'adjust' && qty === 0)) throw bad('กรุณาระบุจำนวนที่มากกว่า 0');
  if (type === 'adjust' && !String(note || '').trim()) throw bad('กรุณาระบุเหตุผลการปรับยอด เช่น ผลตรวจนับ');
  const received = type === 'in' ? checkReceived(input.received_date) : null;

  return tx(() => {
    const item = get('SELECT * FROM consumables WHERE id = ? AND deleted_at IS NULL', consumableId);
    if (!item) throw notFound('วัสดุ');
    let balance;
    let moved = qty;
    if (type === 'in') balance = item.qty_on_hand + qty;
    else if (type === 'out') {
      if (qty > item.qty_on_hand) throw bad(`${item.name}: สต็อกไม่พอ — คงเหลือ ${item.qty_on_hand} ${item.unit} แต่ต้องการเบิก ${qty} ${item.unit}`);
      balance = item.qty_on_hand - qty;
    } else {
      balance = qty;
      moved = qty - item.qty_on_hand;
    }
    run('UPDATE consumables SET qty_on_hand = ?, updated_at = ? WHERE id = ?', balance, now(), item.id);
    run(`INSERT INTO stock_movements (consumable_id, type, qty, balance_after, person_id, department_id, unit_cost, received_date, note, performed_by, doc_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, item.id, type, moved, balance, person_id, department_id,
      unit_cost ?? (type === 'in' ? item.unit_cost : null), received, note, req.user.id, docId);
    audit(req, 'consumable', item.id, `stock_${type}`, { qty_on_hand: item.qty_on_hand }, { qty_on_hand: balance, qty: moved, note });
    return { balance, low: balance <= item.reorder_point };
  });
}
export default r;
