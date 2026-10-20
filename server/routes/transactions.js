import { Router } from 'express';
import ExcelJS from 'exceljs';
import { all, get } from '../db.js';
import { requirePerm } from '../auth.js';
import { audit } from '../audit.js';
import { paging, likeTerm } from './util.js';
import { ACTIONS } from '../lifecycle.js';

const r = Router();

const BASE = `
  FROM asset_transactions t
  JOIN assets a ON a.id = t.asset_id
  LEFT JOIN people p ON p.id = t.person_id
  LEFT JOIN departments d ON d.id = t.department_id
  LEFT JOIN locations l ON l.id = t.location_id
  LEFT JOIN users u ON u.id = t.performed_by
  LEFT JOIN documents doc ON doc.id = t.doc_id`;

function where(q) {
  const w = ['1=1'];
  const p = [];
  if (q.action) { w.push('t.action = ?'); p.push(q.action); }
  if (q.q) { w.push(`(a.asset_tag LIKE ? ESCAPE '\\' OR a.name LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR t.section LIKE ? ESCAPE '\\')`); p.push(likeTerm(q.q), likeTerm(q.q), likeTerm(q.q), likeTerm(q.q)); }
  if (q.from) { w.push('t.created_at >= ?'); p.push(q.from); }
  if (q.to) { w.push(`t.created_at < date(?, '+1 day')`); p.push(q.to); }
  return { sql: w.join(' AND '), p };
}

const COLS = `t.*, a.asset_tag, a.name AS asset_name, p.name AS person_name, d.name AS department_name, l.name AS location_name, u.full_name AS performed_by_name, doc.doc_no, doc.doc_date`;

r.get('/', requirePerm('asset.view'), (req, res) => {
  const { page, pageSize, offset } = paging(req);
  const { sql, p } = where(req.query);
  const total = get(`SELECT COUNT(*) n ${BASE} WHERE ${sql}`, ...p).n;
  const rows = all(`SELECT ${COLS} ${BASE} WHERE ${sql} ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`, ...p, pageSize, offset);
  res.json({ rows, total, page, pageSize });
});

r.get('/export', requirePerm('report.export'), async (req, res, next) => {
  try {
    const { sql, p } = where(req.query);
    const rows = all(`SELECT ${COLS} ${BASE} WHERE ${sql} ORDER BY t.created_at DESC`, ...p);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('ประวัติอุปกรณ์');
    ws.columns = [['วันเวลา (UTC)', 'created_at', 20], ['รหัสทรัพย์สิน', 'asset_tag', 16], ['อุปกรณ์', 'asset_name', 26], ['รายการ', 'action_label', 14],
      ['พนักงาน', 'person_name', 20], ['Section', 'section', 16], ['แผนก', 'department_name', 16], ['สถานที่', 'location_name', 16], ['กำหนดคืน', 'due_date', 12],
      ['หมายเหตุ', 'note', 30], ['ผู้ทำรายการ', 'performed_by_name', 18]].map(([header, key, width]) => ({ header, key, width }));
    ws.getRow(1).font = { bold: true };
    rows.forEach((row) => ws.addRow({ ...row, action_label: row.action === 'receive' ? 'รับเข้า' : ACTIONS[row.action]?.label || row.action }));
    audit(req, 'asset_transaction', null, 'export', null, { count: rows.length });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="asset-history-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

export default r;
