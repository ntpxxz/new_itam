import { Router } from 'express';
import ExcelJS from 'exceljs';
import { all } from '../db.js';
import { requirePerm } from '../auth.js';
import { audit } from '../audit.js';
import { bad, isDate } from './util.js';

const r = Router();

// One row per issued unit-line: per-item assets (issue / borrow) and quantity stock-outs.
// Effective date = slip date when issued through a slip, otherwise the local record date.
const LINES = `
  SELECT * FROM (
    SELECT 'asset' AS kind, t.action AS mode, t.department_id, t.person_id, t.doc_id,
           1 AS qty, 'ชิ้น' AS unit, COALESCE(a.purchase_price, 0) AS value,
           a.asset_tag AS code, a.name, c.name AS category_name,
           COALESCE(doc.doc_date, date(t.created_at, 'localtime')) AS eff_date
    FROM asset_transactions t
    JOIN assets a ON a.id = t.asset_id JOIN categories c ON c.id = a.category_id
    LEFT JOIN documents doc ON doc.id = t.doc_id
    WHERE t.action IN ('issue', 'borrow')
    UNION ALL
    SELECT 'consumable', 'issue', m.department_id, m.person_id, m.doc_id,
           m.qty, x.unit, m.qty * COALESCE(x.unit_cost, 0),
           x.sku, x.name, c.name,
           COALESCE(doc.doc_date, date(m.created_at, 'localtime'))
    FROM stock_movements m
    JOIN consumables x ON x.id = m.consumable_id JOIN categories c ON c.id = x.category_id
    LEFT JOIN documents doc ON doc.id = m.doc_id
    WHERE m.type = 'out'
  ) l
  LEFT JOIN (SELECT id AS dep_id, name AS department_name FROM departments) dep ON dep.dep_id = l.department_id
  LEFT JOIN (SELECT id AS per_id, name AS person_name FROM people) per ON per.per_id = l.person_id`;

function load(q) {
  for (const k of ['from', 'to']) if (q[k] && !isDate(q[k])) throw bad('รูปแบบวันที่ไม่ถูกต้อง');
  const w = ['1=1']; const p = [];
  if (q.from) { w.push('eff_date >= ?'); p.push(q.from); }
  if (q.to) { w.push('eff_date <= ?'); p.push(q.to); }
  if (q.mode === 'issue' || q.mode === 'borrow') { w.push('mode = ?'); p.push(q.mode); }
  if (q.kind === 'asset' || q.kind === 'consumable') { w.push('kind = ?'); p.push(q.kind); }
  if (q.department_id) { w.push(q.department_id === 'none' ? 'department_id IS NULL' : 'department_id = ?'); if (q.department_id !== 'none') p.push(q.department_id); }
  return all(`${LINES} WHERE ${w.join(' AND ')} ORDER BY eff_date DESC`, ...p);
}

function summarize(lines) {
  const depts = new Map();
  const totals = { assets_issued: 0, assets_borrowed: 0, units: 0, value: 0, lines: lines.length };
  for (const l of lines) {
    const key = l.department_id ?? 'none';
    if (!depts.has(key)) {
      depts.set(key, {
        department_id: l.department_id, department_name: l.department_name || 'ไม่ระบุแผนก',
        assets_issued: 0, assets_borrowed: 0, units: 0, value: 0, people: new Set(), slips: new Set(), recipients: new Map(), items: new Map(),
      });
    }
    const d = depts.get(key);
    if (l.kind === 'asset') d[l.mode === 'borrow' ? 'assets_borrowed' : 'assets_issued']++;
    else d.units += l.qty;
    d.value += l.value;
    if (l.person_id) d.people.add(l.person_id);
    if (l.doc_id) d.slips.add(l.doc_id);

    const rKey = l.person_id ?? 'none';
    const rc = d.recipients.get(rKey) || { person_id: l.person_id, person_name: l.person_name, assets: 0, units: 0, value: 0 };
    if (l.kind === 'asset') rc.assets++; else rc.units += l.qty;
    rc.value += l.value;
    d.recipients.set(rKey, rc);

    const iKey = l.kind === 'asset' ? `${l.category_name}|${l.name}` : l.code;
    const it = d.items.get(iKey) || { kind: l.kind, code: l.kind === 'asset' ? null : l.code, name: l.name, category_name: l.category_name, unit: l.unit, qty: 0, value: 0 };
    it.qty += l.qty;
    it.value += l.value;
    d.items.set(iKey, it);

    if (l.kind === 'asset') totals[l.mode === 'borrow' ? 'assets_borrowed' : 'assets_issued']++;
    else totals.units += l.qty;
    totals.value += l.value;
  }
  const rows = [...depts.values()].map((d) => ({
    ...d,
    people: d.people.size,
    slips: d.slips.size,
    recipients: [...d.recipients.values()].sort((a, b) => b.value - a.value),
    items: [...d.items.values()].sort((a, b) => b.value - a.value || b.qty - a.qty),
  })).sort((a, b) => b.value - a.value);
  return { rows, totals };
}

r.get('/issues-by-department', requirePerm('report.view'), (req, res) => {
  res.json(summarize(load(req.query)));
});

r.get('/issues-by-department/export', requirePerm('report.view'), requirePerm('report.export'), async (req, res, next) => {
  try {
    const lines = load(req.query);
    const { rows, totals } = summarize(lines);
    const wb = new ExcelJS.Workbook();
    const period = `${req.query.from || 'เริ่มต้น'} ถึง ${req.query.to || 'ปัจจุบัน'}`;

    const s1 = wb.addWorksheet('สรุปตามแผนก');
    s1.addRow([`รายงานสรุปการเบิกตามแผนก · ${period}`]).font = { bold: true, size: 13 };
    s1.addRow([]);
    const h1 = s1.addRow(['แผนก', 'เบิกถาวร (ชิ้น)', 'ยืม (ชิ้น)', 'นับจำนวน (หน่วย)', 'มูลค่า (บาท)', 'จำนวนผู้รับ', 'จำนวนใบเบิก']);
    h1.font = { bold: true };
    rows.forEach((d) => s1.addRow([d.department_name, d.assets_issued, d.assets_borrowed, d.units, d.value, d.people, d.slips]));
    s1.addRow(['รวม', totals.assets_issued, totals.assets_borrowed, totals.units, totals.value]).font = { bold: true };
    s1.columns.forEach((c, i) => { c.width = i === 0 ? 26 : 16; });
    s1.getColumn(5).numFmt = '#,##0.00';

    const s2 = wb.addWorksheet('แยกตามผู้รับ');
    s2.addRow(['แผนก', 'ผู้รับ', 'รายชิ้น (ชิ้น)', 'นับจำนวน (หน่วย)', 'มูลค่า (บาท)']).font = { bold: true };
    rows.forEach((d) => d.recipients.forEach((x) => s2.addRow([d.department_name, x.person_name || '(ในนามแผนก)', x.assets, x.units, x.value])));
    s2.columns.forEach((c, i) => { c.width = i < 2 ? 24 : 16; });
    s2.getColumn(5).numFmt = '#,##0.00';

    const s3 = wb.addWorksheet('รายละเอียด');
    s3.addRow(['วันที่', 'แผนก', 'ผู้รับ', 'ประเภท', 'รหัส', 'รายการ', 'หมวดหมู่', 'จำนวน', 'หน่วย', 'มูลค่า (บาท)']).font = { bold: true };
    lines.forEach((l) => s3.addRow([l.eff_date, l.department_name || 'ไม่ระบุแผนก', l.person_name || '',
      l.kind === 'consumable' ? 'เบิก (นับจำนวน)' : l.mode === 'borrow' ? 'ยืม' : 'เบิกถาวร', l.code, l.name, l.category_name, l.qty, l.unit, l.value]));
    s3.columns.forEach((c, i) => { c.width = [12, 22, 22, 16, 16, 30, 16, 8, 8, 14][i]; });
    s3.getColumn(10).numFmt = '#,##0.00';

    audit(req, 'report', null, 'export', null, { report: 'issues-by-department', filter: req.query, lines: lines.length });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="issues-by-department-${req.query.from || 'all'}_${req.query.to || 'now'}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

export default r;
