import { Router } from 'express';
import ExcelJS from 'exceljs';
import QRCode from 'qrcode';
import { all, get, run, now, tx, setting } from '../db.js';
import { requirePerm, can } from '../auth.js';
import { audit } from '../audit.js';
import { ACTIONS, STATUS_LABEL, allowedActions, checkTransition } from '../lifecycle.js';
import { resolveRecipient } from '../recipient.js';
import { HttpError, bad, notFound, paging, likeTerm, isDate, today, toNum, toInt, uploadImage, uploadEvidence, uploadExcel } from './util.js';

const r = Router();

export const SELECT = `
  SELECT a.*, c.name AS category_name, c.prefix AS category_prefix,
         l.name AS location_name, l.branch AS location_branch,
         p.name AS holder_name, p.emp_code AS holder_code,
         d.name AS department_name, v.name AS vendor_name
  FROM assets a
  JOIN categories c ON c.id = a.category_id
  LEFT JOIN locations l ON l.id = a.location_id
  LEFT JOIN people p ON p.id = a.holder_person_id
  LEFT JOIN departments d ON d.id = a.department_id
  LEFT JOIN vendors v ON v.id = a.vendor_id`;

const FIELDS = ['category_id', 'name', 'brand', 'model', 'serial_no', 'specs', 'location_id', 'department_id',
  'purchase_date', 'purchase_price', 'po_number', 'invoice_number', 'vendor_id', 'warranty_expiry', 'received_date', 'notes'];

function normalize(body) {
  const v = {};
  for (const f of FIELDS) v[f] = typeof body[f] === 'string' ? body[f].trim() : body[f];
  if (!v.name) throw bad('กรุณากรอกชื่ออุปกรณ์');
  v.category_id = toInt(v.category_id);
  if (!v.category_id) throw bad('กรุณาเลือกหมวดหมู่');
  const cat = get(`SELECT * FROM categories WHERE id = ? AND kind = 'asset' AND deleted_at IS NULL`, v.category_id);
  if (!cat) throw bad('หมวดหมู่ไม่ถูกต้อง — เลือกหมวดหมู่ประเภทอุปกรณ์');
  for (const f of ['purchase_date', 'warranty_expiry', 'received_date']) if (!isDate(v[f])) throw bad('รูปแบบวันที่ไม่ถูกต้อง');
  if (!v.received_date) v.received_date = body.id ? null : today();
  if (v.received_date && v.received_date > today()) throw bad('วันที่รับเข้าต้องไม่เป็นวันในอนาคต');
  if (v.received_date && v.purchase_date && v.received_date < v.purchase_date) throw bad('วันที่รับเข้าต้องไม่ก่อนวันที่ซื้อ');
  v.purchase_price = toNum(v.purchase_price);
  if (v.purchase_price !== null && (Number.isNaN(v.purchase_price) || v.purchase_price < 0)) throw bad('ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
  for (const f of ['location_id', 'department_id', 'vendor_id']) v[f] = toInt(v[f]);
  if (v.serial_no) {
    const dup = get('SELECT asset_tag FROM assets WHERE serial_no = ? AND deleted_at IS NULL AND id <> ?', v.serial_no, body.id || 0);
    if (dup) throw bad(`Serial Number นี้ซ้ำกับอุปกรณ์ ${dup.asset_tag}`);
  }
  return { v, cat };
}

export function nextAssetTag(prefix, year = new Date().getFullYear()) {
  const base = `${prefix}-${year}-`;
  const row = get(`SELECT asset_tag FROM assets WHERE asset_tag LIKE ? ORDER BY asset_tag DESC LIMIT 1`, base + '%');
  const n = row ? parseInt(row.asset_tag.slice(base.length), 10) + 1 : 1;
  return base + String(n).padStart(5, '0');
}

export function createAsset(req, body, docId = null) {
  const { v, cat } = normalize(body);
  return tx(() => {
    const tag = nextAssetTag(cat.prefix, v.purchase_date ? Number(v.purchase_date.slice(0, 4)) : undefined);
    const info = run(
      `INSERT INTO assets (asset_tag, ${FIELDS.join(',')}) VALUES (?, ${FIELDS.map(() => '?').join(',')})`,
      tag, ...FIELDS.map((f) => v[f]),
    );
    const id = Number(info.lastInsertRowid);
    run(`INSERT INTO asset_transactions (asset_id, action, to_status, location_id, cost, note, performed_by, doc_id)
         VALUES (?, 'receive', 'available', ?, ?, ?, ?, ?)`, id, v.location_id, v.purchase_price, `รับเข้าคลัง${v.received_date ? ` วันที่ ${v.received_date}` : ''}`, req.user.id, docId);
    audit(req, 'asset', id, 'create', null, get('SELECT * FROM assets WHERE id = ?', id));
    return id;
  });
}

function buildFilter(q) {
  const where = ['a.deleted_at IS NULL'];
  const params = [];
  if (q.q) {
    where.push(`(a.asset_tag LIKE ? ESCAPE '\\' OR a.name LIKE ? ESCAPE '\\' OR a.serial_no LIKE ? ESCAPE '\\' OR a.brand LIKE ? ESCAPE '\\' OR a.model LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR a.holder_section LIKE ? ESCAPE '\\')`);
    params.push(...Array(7).fill(likeTerm(q.q)));
  }
  if (q.status) {
    const list = String(q.status).split(',').filter((s) => STATUS_LABEL[s]);
    if (list.length) { where.push(`a.status IN (${list.map(() => '?').join(',')})`); params.push(...list); }
  } else if (q.includeScrapped !== '1') {
    where.push(`a.status <> 'scrapped'`);
  }
  if (q.category_id) { where.push('a.category_id = ?'); params.push(q.category_id); }
  if (q.location_id) { where.push('a.location_id = ?'); params.push(q.location_id); }
  if (q.department_id) { where.push('a.department_id = ?'); params.push(q.department_id); }
  if (q.holder_person_id) { where.push('a.holder_person_id = ?'); params.push(q.holder_person_id); }
  if (q.overdue === '1') { where.push(`a.status = 'borrowed' AND a.due_date < date('now','localtime')`); }
  if (q.due_within) { where.push(`a.status = 'borrowed' AND a.due_date BETWEEN date('now','localtime') AND date('now','localtime', '+' || ? || ' days')`); params.push(q.due_within); }
  if (q.warranty === '1') { where.push(`a.warranty_expiry BETWEEN date('now','localtime') AND date('now','localtime', '+' || ? || ' days') AND a.status <> 'scrapped'`); params.push(q.days || 30); }
  return { sql: where.join(' AND '), params };
}

const SORTS = { asset_tag: 'a.asset_tag', name: 'a.name', status: 'a.status', updated_at: 'a.updated_at', due_date: 'a.due_date', warranty_expiry: 'a.warranty_expiry', purchase_price: 'a.purchase_price' };

r.get('/', requirePerm('asset.view'), (req, res) => {
  const { page, pageSize, offset } = paging(req);
  const { sql, params } = buildFilter(req.query);
  const sort = SORTS[req.query.sort] || 'a.updated_at';
  const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  const total = get(`SELECT COUNT(*) AS n FROM assets a LEFT JOIN people p ON p.id = a.holder_person_id WHERE ${sql}`, ...params).n;
  const rows = all(`${SELECT} WHERE ${sql} ORDER BY ${sort} ${dir}, a.id DESC LIMIT ? OFFSET ?`, ...params, pageSize, offset);
  res.json({ rows, total, page, pageSize });
});

r.get('/next-tag', requirePerm('asset.create'), (req, res) => {
  const cat = get('SELECT prefix FROM categories WHERE id = ?', req.query.category_id);
  res.json({ tag: cat ? nextAssetTag(cat.prefix) : null });
});

r.get('/export', requirePerm('report.export'), async (req, res, next) => {
  try {
    const { sql, params } = buildFilter({ ...req.query, includeScrapped: '1' });
    const rows = all(`${SELECT} WHERE ${sql} ORDER BY a.asset_tag`, ...params);
    const wb = new ExcelJS.Workbook();
    addAssetSheet(wb, rows);
    audit(req, 'asset', null, 'export', null, { count: rows.length, filter: req.query });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="assets-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

export function addAssetSheet(wb, rows) {
    const ws = wb.addWorksheet('อุปกรณ์รายชิ้น');
    ws.columns = [
      ['รหัสทรัพย์สิน', 'asset_tag', 18], ['ชื่อ', 'name', 28], ['หมวดหมู่', 'category_name', 16], ['ยี่ห้อ', 'brand', 14],
      ['รุ่น', 'model', 18], ['Serial Number', 'serial_no', 20], ['สถานะ', 'status_label', 12], ['ผู้ถือครอง', 'holder_name', 20], ['Section', 'holder_section', 16],
      ['แผนก', 'department_name', 16], ['สถานที่', 'location_name', 18], ['กำหนดคืน', 'due_date', 12], ['วันที่ซื้อ', 'purchase_date', 12],
      ['ราคา', 'purchase_price', 12], ['PO', 'po_number', 14], ['ใบแจ้งหนี้', 'invoice_number', 14], ['ผู้ขาย', 'vendor_name', 18],
      ['หมดประกัน', 'warranty_expiry', 12], ['วันที่รับเข้า', 'received_date', 12], ['สเปก', 'specs', 30], ['หมายเหตุ', 'notes', 24],
    ].map(([header, key, width]) => ({ header, key, width }));
    ws.getRow(1).font = { bold: true };
    rows.forEach((row) => ws.addRow({ ...row, status_label: STATUS_LABEL[row.status] }));
}

const IMPORT_COLS = ['หมวดหมู่*', 'ชื่อ*', 'ยี่ห้อ', 'รุ่น', 'Serial Number', 'สเปก', 'สถานที่', 'วันที่ซื้อ (YYYY-MM-DD)', 'ราคา', 'PO', 'ใบแจ้งหนี้', 'ผู้ขาย', 'หมดประกัน (YYYY-MM-DD)', 'หมายเหตุ', 'วันที่รับเข้า (YYYY-MM-DD)'];

r.get('/import/template', requirePerm('data.import'), async (req, res, next) => {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('นำเข้าอุปกรณ์');
    ws.addRow(IMPORT_COLS).font = { bold: true };
    ws.addRow(['โน้ตบุ๊ก', 'Dell Latitude 5440', 'Dell', 'Latitude 5440', 'SN123456', 'i5 / 16GB / 512GB', 'คลัง IT ชั้น 3', '2026-01-15', 32900, 'PO-2026-001', 'INV-889', 'Advice IT', '2029-01-15', '', '2026-01-20']);
    ws.columns.forEach((c) => { c.width = 20; });
    const cats = all(`SELECT name FROM categories WHERE kind='asset' AND deleted_at IS NULL ORDER BY name`).map((c) => c.name);
    const ref = wb.addWorksheet('หมวดหมู่ที่ใช้ได้');
    ref.addRow(['หมวดหมู่']).font = { bold: true };
    cats.forEach((c) => ref.addRow([c]));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="asset-import-template.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

function cellValue(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') return String(v.text ?? v.result ?? (v.richText ? v.richText.map((t) => t.text).join('') : ''));
  return String(v).trim();
}

r.post('/import', requirePerm('data.import'), uploadExcel.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw bad('กรุณาเลือกไฟล์ Excel (.xlsx)');
    const dryRun = req.query.dryRun === '1';
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(req.file.buffer); } catch { throw bad('อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ .xlsx ตามแม่แบบ'); }
    const ws = wb.worksheets[0];
    const lookup = (table, name, extra = '') => (name ? get(`SELECT id FROM ${table} WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL ${extra}`, name)?.id : null);
    const results = [];
    const valid = [];
    ws.eachRow((row, idx) => {
      if (idx === 1) return;
      const c = IMPORT_COLS.map((_, i) => cellValue(row.getCell(i + 1)));
      if (c.every((x) => !x)) return;
      const body = {
        category_id: lookup('categories', c[0], `AND kind='asset'`), name: c[1], brand: c[2], model: c[3], serial_no: c[4], specs: c[5],
        location_id: lookup('locations', c[6]), purchase_date: c[7], purchase_price: c[8], po_number: c[9], invoice_number: c[10],
        vendor_id: lookup('vendors', c[11]), warranty_expiry: c[12], notes: c[13], received_date: c[14],
      };
      try {
        if (!body.category_id) throw bad(`ไม่พบหมวดหมู่ "${c[0]}"`);
        if (c[6] && !body.location_id) throw bad(`ไม่พบสถานที่ "${c[6]}"`);
        if (c[11] && !body.vendor_id) throw bad(`ไม่พบผู้ขาย "${c[11]}"`);
        normalize(body);
        if (body.serial_no && valid.some((b) => b.serial_no === body.serial_no)) throw bad('Serial Number ซ้ำในไฟล์');
        valid.push(body);
        results.push({ row: idx, name: c[1], ok: true });
      } catch (e) {
        results.push({ row: idx, name: c[1], ok: false, error: e.message });
      }
    });
    let created = 0;
    if (!dryRun && results.every((x) => x.ok) && valid.length) {
      tx(() => { for (const body of valid) { createAsset(req, body); created++; } });
    }
    res.json({ results, created, dryRun, total: results.length, errors: results.filter((x) => !x.ok).length });
  } catch (e) { next(e); }
});

r.get('/by-tag/:tag', requirePerm('asset.view'), (req, res) => {
  const tag = decodeURIComponent(req.params.tag).trim();
  const a = get('SELECT id FROM assets WHERE (asset_tag = ? COLLATE NOCASE OR serial_no = ?) AND deleted_at IS NULL', tag, tag);
  if (!a) throw notFound(`อุปกรณ์รหัส ${tag}`);
  res.json({ id: a.id });
});

r.get('/:id', requirePerm('asset.view'), (req, res) => {
  const a = get(`${SELECT} WHERE a.id = ? AND a.deleted_at IS NULL`, req.params.id);
  if (!a) throw notFound('อุปกรณ์');
  const history = all(`
    SELECT t.*, p.name AS person_name, d.name AS department_name, l.name AS location_name, u.full_name AS performed_by_name,
           (SELECT doc_no FROM documents WHERE id = t.doc_id) AS doc_no,
           (SELECT doc_date FROM documents WHERE id = t.doc_id) AS doc_date
    FROM asset_transactions t
    LEFT JOIN people p ON p.id = t.person_id
    LEFT JOIN departments d ON d.id = t.department_id
    LEFT JOIN locations l ON l.id = t.location_id
    LEFT JOIN users u ON u.id = t.performed_by
    WHERE t.asset_id = ? ORDER BY t.created_at DESC, t.id DESC`, a.id);
  res.json({ asset: a, history, allowedActions: allowedActions(a.status, (p) => can(req.user, p)) });
});

r.get('/:id/qr', requirePerm('asset.view'), async (req, res, next) => {
  try {
    const a = get('SELECT asset_tag FROM assets WHERE id = ?', req.params.id);
    if (!a) throw notFound('อุปกรณ์');
    const origin = (setting('public_base_url', '') || req.query.origin || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    const svg = await QRCode.toString(`${origin}/a/${encodeURIComponent(a.asset_tag)}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
    res.type('image/svg+xml').send(svg);
  } catch (e) { next(e); }
});

r.post('/', requirePerm('asset.create'), (req, res) => {
  const id = createAsset(req, req.body || {});
  res.status(201).json(get(`${SELECT} WHERE a.id = ?`, id));
});

r.put('/:id', requirePerm('asset.edit'), (req, res) => {
  const before = get('SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL', req.params.id);
  if (!before) throw notFound('อุปกรณ์');
  if (before.status === 'scrapped') throw bad('อุปกรณ์ที่ Scrap แล้วแก้ไขไม่ได้');
  const { v } = normalize({ ...req.body, id: before.id });
  tx(() => {
    run(`UPDATE assets SET ${FIELDS.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...FIELDS.map((f) => v[f]), now(), before.id);
    audit(req, 'asset', before.id, 'update', before, get('SELECT * FROM assets WHERE id = ?', before.id));
  });
  res.json(get(`${SELECT} WHERE a.id = ?`, before.id));
});

r.post('/:id/image', requirePerm('asset.edit'), uploadImage.single('image'), (req, res) => {
  const before = get('SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL', req.params.id);
  if (!before) throw notFound('อุปกรณ์');
  if (!req.file) throw bad('กรุณาเลือกรูปภาพ');
  const path = `/uploads/${req.file.filename}`;
  tx(() => {
    run('UPDATE assets SET image_path = ?, updated_at = ? WHERE id = ?', path, now(), before.id);
    audit(req, 'asset', before.id, 'update_image', { image_path: before.image_path }, { image_path: path });
  });
  res.json({ image_path: path });
});

r.delete('/:id', requirePerm('asset.delete'), (req, res) => {
  const before = get('SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL', req.params.id);
  if (!before) throw notFound('อุปกรณ์');
  if (['borrowed', 'issued', 'repair'].includes(before.status)) {
    throw bad(`ลบไม่ได้ เพราะอุปกรณ์อยู่ในสถานะ "${STATUS_LABEL[before.status]}" — รับคืนเข้าคลังก่อน`);
  }
  tx(() => {
    run('UPDATE assets SET deleted_at = ?, updated_at = ? WHERE id = ?', now(), now(), before.id);
    audit(req, 'asset', before.id, 'delete', before, null);
  });
  res.json({ ok: true });
});

// Lifecycle action: borrow / issue / return / transfer / repair_out / repair_in / to_disposal / cancel_disposal / scrap
r.post('/:id/actions/:action', requirePerm('asset.transact', 'asset.scrap'), uploadEvidence.single('evidence'), (req, res) => {
  const evidence = req.file ? `/uploads/${req.file.filename}` : null;
  const status = applyAction(req, req.params.id, req.params.action, { ...(req.body || {}), evidence });
  res.json({ ok: true, status });
});

// Shared by the action route and receive/issue documents. Throws HttpError on invalid input or transition.
export function applyAction(req, assetId, action, input, docId = null) {
  const def = ACTIONS[action];
  if (!def) throw notFound('รายการ');
  if (!can(req.user, def.perm)) throw new HttpError(403, `คุณไม่มีสิทธิ์ "${def.label}" — ติดต่อผู้ดูแลระบบ`);

  const a = get('SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL', assetId);
  if (!a) throw notFound('อุปกรณ์');
  const problem = checkTransition(action, a.status);
  if (problem) throw new HttpError(409, `${a.asset_tag}: ${problem}`);

  const b = input || {};
  const recipient = ['borrow', 'issue', 'transfer'].includes(action)
    ? resolveRecipient(req, b, { required: def.needs.includes('recipient') })
    : { person_id: toInt(b.person_id), department_id: toInt(b.department_id), section: null };
  const { person_id, department_id, section } = recipient;
  const location_id = toInt(b.location_id);
  const note = (b.note || '').trim();
  const due_date = b.due_date || null;
  const cost = toNum(b.cost);
  const evidence = b.evidence || null;

  if (def.needs.includes('due_date')) {
    if (!due_date || !isDate(due_date)) throw bad('กรุณาระบุวันกำหนดคืน');
    if (due_date < (b.min_due || today())) throw bad(b.min_due ? 'วันกำหนดคืนต้องไม่ก่อนวันที่เบิก' : 'วันกำหนดคืนต้องไม่ย้อนหลัง');
  }
  if (def.needs.includes('note') && !note) throw bad(action === 'scrap' ? 'กรุณาระบุเหตุผลการ Scrap' : 'กรุณาระบุรายละเอียด/สาเหตุ');
  if (def.needs.includes('evidence') && !evidence) throw bad('กรุณาแนบหลักฐานการ Scrap (รูปภาพหรือ PDF) เช่น ใบอนุมัติจำหน่าย');
  if (action === 'transfer' && !person_id && !department_id && !location_id && !section) throw bad('กรุณาระบุปลายทางที่จะโอนย้าย (ผู้ถือครอง, Section, แผนก หรือสถานที่)');
  if (person_id && !get('SELECT 1 FROM people WHERE id = ? AND deleted_at IS NULL', person_id)) throw bad('ไม่พบพนักงานที่เลือก');

  const patch = {};
  const to = def.to ?? a.status;
  patch.status = to;
  switch (action) {
    case 'borrow':
    case 'issue': {
      patch.holder_person_id = person_id;
      patch.holder_section = section;
      patch.department_id = department_id ?? a.department_id;
      patch.due_date = action === 'borrow' ? due_date : null;
      if (location_id) patch.location_id = location_id;
      break;
    }
    case 'return':
    case 'repair_in':
      patch.holder_person_id = null;
      patch.holder_section = null;
      patch.due_date = null;
      if (location_id) patch.location_id = location_id;
      break;
    case 'transfer':
      if (person_id || section) {
        if (a.status === 'available') throw bad('อุปกรณ์ในคลังโอนให้บุคคลไม่ได้ — ใช้ "ยืม" หรือ "เบิกถาวร" แทน');
        patch.holder_person_id = person_id;
        patch.holder_section = section;
      }
      if (department_id) patch.department_id = department_id;
      if (location_id) patch.location_id = location_id;
      if (a.status === 'borrowed' && due_date) patch.due_date = due_date;
      break;
    default:
      break;
  }

  tx(() => {
    const keys = Object.keys(patch);
    run(`UPDATE assets SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...keys.map((k) => patch[k]), now(), a.id);
    const returning = ['return', 'repair_in'].includes(action);
    run(`INSERT INTO asset_transactions (asset_id, action, from_status, to_status, person_id, section, department_id, location_id, due_date, note, evidence_path, cost, performed_by, doc_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      a.id, action, a.status, to,
      person_id ?? (returning ? a.holder_person_id : null), section ?? (returning ? a.holder_section : null),
      patch.department_id ?? department_id, patch.location_id ?? location_id,
      patch.due_date ?? null, note, evidence, cost, req.user.id, docId);
    audit(req, 'asset', a.id, action, a, get('SELECT * FROM assets WHERE id = ?', a.id));
  });
  return to;
}
export default r;
