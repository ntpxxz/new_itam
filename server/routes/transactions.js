import { Router } from 'express';
import ExcelJS from 'exceljs';
import { all, get } from '../db.js';
import { requirePerm } from '../auth.js';
import { audit } from '../audit.js';
import { paging, likeTerm, isDate, addDays } from './util.js';
import { ACTIONS } from '../lifecycle.js';

const r = Router();

// Asset transactions + consumable stock movements, one row shape: kind 'asset' | 'consumable'.
const ROWS = `
  SELECT 'asset' AS kind, t.id, t.action, t.asset_id AS item_id, a.asset_tag AS item_code, a.name AS item_name, t.to_status,
    NULL AS qty, NULL AS balance_after, NULL AS unit, t.person_id, t.department_id, t.location_id, t.due_date, t.note, t.evidence_path,
    t.performed_by, t.doc_id, t.created_at
  FROM asset_transactions t JOIN assets a ON a.id = t.asset_id
  UNION ALL
  SELECT 'consumable' AS kind, m.id, CASE m.type WHEN 'in' THEN 'stock_in' WHEN 'out' THEN 'stock_out' ELSE 'stock_adjust' END AS action,
    m.consumable_id AS item_id, c.sku AS item_code, c.name AS item_name, NULL AS to_status,
    m.qty, m.balance_after, c.unit, m.person_id, m.department_id, NULL AS location_id, NULL AS due_date, m.note, NULL AS evidence_path,
    m.performed_by, m.doc_id, m.created_at
  FROM stock_movements m JOIN consumables c ON c.id = m.consumable_id`;

const BASE = `
  FROM (${ROWS}) h
  LEFT JOIN people p ON p.id = h.person_id
  LEFT JOIN departments d ON d.id = h.department_id
  LEFT JOIN locations l ON l.id = h.location_id
  LEFT JOIN users u ON u.id = h.performed_by
  LEFT JOIN documents doc ON doc.id = h.doc_id`;

const STOCK_LABELS = { stock_in: 'รับเข้า (วัสดุ)', stock_out: 'เบิก (วัสดุ)', stock_adjust: 'ปรับยอด (วัสดุ)' };

function where(q) {
  const w = ['1=1'];
  const p = [];
  if (q.kind === 'asset' || q.kind === 'consumable') { w.push('h.kind = ?'); p.push(q.kind); }
  if (q.action) { w.push('h.action = ?'); p.push(q.action); }
  if (q.q) { w.push(`(h.item_code LIKE ? ESCAPE '\\' OR h.item_name LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR d.name LIKE ? ESCAPE '\\')`); p.push(likeTerm(q.q), likeTerm(q.q), likeTerm(q.q), likeTerm(q.q)); }
  if (q.from && isDate(q.from)) { w.push('h.created_at >= ?'); p.push(q.from); }
  if (q.to && isDate(q.to)) { w.push('h.created_at < ?'); p.push(addDays(q.to, 1)); }
  return { sql: w.join(' AND '), p };
}

const COLS = `h.*, p.name AS person_name, d.name AS department_name, l.name AS location_name, u.full_name AS performed_by_name, doc.doc_no, doc.doc_date`;

r.get('/', requirePerm('history.view'), async (req, res) => {
  const { page, pageSize, offset } = paging(req);
  const { sql, p } = where(req.query);
  const total = (await get(`SELECT COUNT(*) n ${BASE} WHERE ${sql}`, ...p)).n;
  const rows = await all(`SELECT ${COLS} ${BASE} WHERE ${sql} ORDER BY h.created_at DESC, h.kind, h.id DESC LIMIT ? OFFSET ?`, ...p, pageSize, offset);
  res.json({ rows, total, page, pageSize });
});

r.get('/export', requirePerm('report.export'), async (req, res) => {
  const { sql, p } = where(req.query);
  const rows = await all(`SELECT ${COLS} ${BASE} WHERE ${sql} ORDER BY h.created_at DESC, h.kind, h.id DESC`, ...p);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('ประวัติรายการ');
  ws.columns = [['วันเวลา (UTC)', 'created_at', 20], ['รหัส / SKU', 'item_code', 18], ['อุปกรณ์', 'item_name', 26], ['รายการ', 'action_label', 16], ['จำนวน', 'qty', 10], ['คงเหลือ', 'balance_after', 10], ['เลขที่ใบ', 'doc_no', 16],
    ['พนักงาน', 'person_name', 20], ['แผนก', 'department_name', 16], ['สถานที่', 'location_name', 16], ['กำหนดคืน', 'due_date', 12],
    ['หมายเหตุ', 'note', 30], ['ผู้ทำรายการ', 'performed_by_name', 18]].map(([header, key, width]) => ({ header, key, width }));
  ws.getRow(1).font = { bold: true };
  rows.forEach((row) => ws.addRow({ ...row, action_label: row.action === 'receive' ? 'รับเข้า' : STOCK_LABELS[row.action] || ACTIONS[row.action]?.label || row.action }));
  await audit(req, 'asset_transaction', null, 'export', null, { count: rows.length });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="history-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

export default r;
