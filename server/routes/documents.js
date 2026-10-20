import { Router } from 'express';
import { all, get, run, tx } from '../db.js';
import { requirePerm, can } from '../auth.js';
import { audit } from '../audit.js';
import { HttpError, bad, notFound, paging, likeTerm, isDate, today, toInt } from './util.js';
import { createAsset, applyAction } from './assets.js';
import { moveStock } from './consumables.js';
import { resolveRecipient } from '../recipient.js';

// Receive (ใบรับเข้า) and issue (ใบเบิก) slips. A slip holds many lines, mixing per-item assets and
// quantity-tracked consumables; all lines are applied in one transaction (all or nothing).
const r = Router();

function nextDocNo(type, date) {
  const base = `${type === 'receive' ? 'RCV' : 'ISS'}-${date.slice(0, 4)}${date.slice(5, 7)}-`;
  const row = get('SELECT doc_no FROM documents WHERE doc_no LIKE ? ORDER BY doc_no DESC LIMIT 1', base + '%');
  return base + String(row ? parseInt(row.doc_no.slice(base.length), 10) + 1 : 1).padStart(4, '0');
}

const lineError = (i, e) => new HttpError(e.status || 400, `รายการที่ ${i + 1}: ${e.message}`);

function checkDocDate(d) {
  if (!d || !isDate(d)) throw bad('กรุณาระบุวันที่');
  if (d > today()) throw bad('วันที่ต้องไม่เป็นวันในอนาคต');
  return d;
}

/* ---------- receive ---------- */
r.post('/receive', requirePerm('asset.create', 'consumable.move'), (req, res) => {
  const b = req.body || {};
  const lines = Array.isArray(b.lines) ? b.lines : [];
  if (!lines.length) throw bad('กรุณาเพิ่มอย่างน้อย 1 รายการ');
  const doc_date = checkDocDate(b.doc_date);
  if (b.purchase_date && (!isDate(b.purchase_date) || b.purchase_date > doc_date)) throw bad('วันที่ซื้อต้องไม่หลังวันที่รับเข้า');
  const location_id = toInt(b.location_id);
  const vendor_id = toInt(b.vendor_id);

  const result = tx(() => {
    const doc_no = nextDocNo('receive', doc_date);
    const docId = Number(run(`INSERT INTO documents (doc_no, type, doc_date, location_id, vendor_id, po_number, invoice_number, note, created_by)
      VALUES (?, 'receive', ?, ?, ?, ?, ?, ?, ?)`, doc_no, doc_date, location_id, vendor_id, b.po_number, b.invoice_number, b.note, req.user.id).lastInsertRowid);
    let assets = 0;
    let units = 0;
    lines.forEach((l, i) => {
      try {
        if (l.kind === 'consumable') {
          if (!can(req.user, 'consumable.move')) throw new HttpError(403, 'คุณไม่มีสิทธิ์รับเข้าวัสดุสิ้นเปลือง');
          const note = [b.po_number && `PO ${b.po_number}`, l.note].filter(Boolean).join(' · ') || null;
          moveStock(req, l.consumable_id, { type: 'in', qty: l.qty, unit_cost: l.unit_cost, received_date: doc_date, note }, docId);
          units += toInt(l.qty);
        } else if (l.kind === 'asset') {
          if (!can(req.user, 'asset.create')) throw new HttpError(403, 'คุณไม่มีสิทธิ์รับเข้าอุปกรณ์รายชิ้น');
          const serials = (Array.isArray(l.serials) ? l.serials : []).map((s) => String(s).trim());
          const qty = Math.max(serials.length, toInt(l.qty) || 1);
          if (qty > 200) throw bad('รับเข้าได้ครั้งละไม่เกิน 200 ชิ้นต่อรายการ');
          const filled = serials.filter(Boolean);
          if (new Set(filled).size !== filled.length) throw bad('Serial Number ซ้ำกันในรายการ');
          for (let k = 0; k < qty; k++) {
            createAsset(req, {
              category_id: l.category_id, name: l.name, brand: l.brand, model: l.model, specs: l.specs, serial_no: serials[k] || null,
              purchase_price: l.unit_price, purchase_date: b.purchase_date || doc_date, warranty_expiry: l.warranty_expiry,
              po_number: b.po_number, invoice_number: b.invoice_number, vendor_id, location_id, department_id: l.department_id,
              received_date: doc_date, notes: l.note,
            }, docId);
            assets++;
          }
        } else throw bad('ประเภทรายการไม่ถูกต้อง');
      } catch (e) { throw lineError(i, e); }
    });
    audit(req, 'document', docId, 'receive', null, { doc_no, lines: lines.length, assets, units });
    return { id: docId, doc_no, assets, units };
  });
  res.status(201).json(result);
});

// A backdated issue must not predate the asset's receipt or its latest movement.
function checkNotBeforeHistory(assetId, docDate) {
  const a = get('SELECT asset_tag, received_date FROM assets WHERE id = ?', assetId);
  if (!a) return;
  const last = get(`SELECT MAX(COALESCE(d.doc_date, date(t.created_at, 'localtime'))) AS d
    FROM asset_transactions t LEFT JOIN documents d ON d.id = t.doc_id WHERE t.asset_id = ?`, assetId)?.d;
  const floor = [a.received_date, last].filter(Boolean).sort().at(-1);
  if (floor && docDate < floor) throw bad(`${a.asset_tag}: วันที่เบิกต้องไม่ก่อน ${floor} (วันที่รับเข้า/รายการล่าสุดของอุปกรณ์)`);
}

/* ---------- issue ---------- */
r.post('/issue', requirePerm('asset.transact', 'consumable.move'), (req, res) => {
  const b = req.body || {};
  const lines = Array.isArray(b.lines) ? b.lines : [];
  if (!lines.length) throw bad('กรุณาเพิ่มอย่างน้อย 1 รายการ');
  const mode = b.mode === 'borrow' ? 'borrow' : 'issue';
  const doc_date = b.doc_date ? checkDocDate(b.doc_date) : today();
  const due_date = mode === 'borrow' ? b.due_date : null;
  if (mode === 'borrow' && (!due_date || !isDate(due_date) || due_date < doc_date)) throw bad('กรุณาระบุวันกำหนดคืน (ต้องไม่ก่อนวันที่เบิก)');
  const ids = lines.filter((l) => l.kind === 'asset').map((l) => toInt(l.asset_id));
  if (new Set(ids).size !== ids.length) throw bad('มีอุปกรณ์ชิ้นเดียวกันซ้ำในใบเบิก');
  if (mode === 'borrow' && lines.some((l) => l.kind === 'consumable')) throw bad('รายการนับจำนวนเป็นของสิ้นเปลือง ยืมไม่ได้ — ใช้ประเภท “เบิกออก”');

  const result = tx(() => {
    const who = resolveRecipient(req, b);
    const { person_id, department_id } = who;
    const doc_no = nextDocNo('issue', doc_date);
    const docId = Number(run(`INSERT INTO documents (doc_no, type, doc_date, mode, person_id, department_id, location_id, due_date, note, created_by)
      VALUES (?, 'issue', ?, ?, ?, ?, ?, ?, ?, ?)`, doc_no, doc_date, mode, person_id, department_id, toInt(b.location_id), due_date, b.note, req.user.id).lastInsertRowid);
    let assets = 0;
    let units = 0;
    lines.forEach((l, i) => {
      try {
        if (l.kind === 'consumable') {
          if (!can(req.user, 'consumable.move')) throw new HttpError(403, 'คุณไม่มีสิทธิ์เบิกวัสดุสิ้นเปลือง');
          moveStock(req, l.consumable_id, { type: 'out', qty: l.qty, ...who, note: [doc_no, l.note || b.note].filter(Boolean).join(' · ') }, docId);
          units += toInt(l.qty);
        } else if (l.kind === 'asset') {
          checkNotBeforeHistory(l.asset_id, doc_date);
          applyAction(req, l.asset_id, mode, { ...who, location_id: b.location_id, due_date, min_due: doc_date, note: [doc_no, l.note || b.note].filter(Boolean).join(' · ') }, docId);
          assets++;
        } else throw bad('ประเภทรายการไม่ถูกต้อง');
      } catch (e) { throw lineError(i, e); }
    });
    audit(req, 'document', docId, 'issue', null, { doc_no, mode, person_id, department_id, lines: lines.length, assets, units });
    return { id: docId, doc_no, assets, units };
  });
  res.status(201).json(result);
});

/* ---------- read ---------- */
const DOC_SELECT = `
  SELECT d.*, p.name AS person_name, p.emp_code, dp.name AS department_name, l.name AS location_name, v.name AS vendor_name,
         u.full_name AS created_by_name,
         (SELECT COUNT(*) FROM asset_transactions t WHERE t.doc_id = d.id) AS asset_count,
         (SELECT COALESCE(SUM(ABS(m.qty)),0) FROM stock_movements m WHERE m.doc_id = d.id) AS unit_count,
         (SELECT COALESCE(SUM(t.cost),0) FROM asset_transactions t WHERE t.doc_id = d.id) +
         (SELECT COALESCE(SUM(ABS(m.qty) * COALESCE(m.unit_cost,0)),0) FROM stock_movements m WHERE m.doc_id = d.id AND m.type = 'in') AS total_value
  FROM documents d
  LEFT JOIN people p ON p.id = d.person_id LEFT JOIN departments dp ON dp.id = d.department_id
  LEFT JOIN locations l ON l.id = d.location_id LEFT JOIN vendors v ON v.id = d.vendor_id
  LEFT JOIN users u ON u.id = d.created_by`;

r.get('/', requirePerm('asset.view', 'consumable.view'), (req, res) => {
  const { page, pageSize, offset } = paging(req);
  const w = ['1=1']; const p = [];
  if (req.query.type) { w.push('d.type = ?'); p.push(req.query.type); }
  if (req.query.q) { w.push(`(d.doc_no LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR dp.name LIKE ? ESCAPE '\\' OR d.po_number LIKE ? ESCAPE '\\')`); p.push(likeTerm(req.query.q), likeTerm(req.query.q), likeTerm(req.query.q), likeTerm(req.query.q)); }
  const total = get(`SELECT COUNT(*) n FROM documents d LEFT JOIN people p ON p.id = d.person_id LEFT JOIN departments dp ON dp.id = d.department_id WHERE ${w.join(' AND ')}`, ...p).n;
  const rows = all(`${DOC_SELECT} WHERE ${w.join(' AND ')} ORDER BY d.id DESC LIMIT ? OFFSET ?`, ...p, pageSize, offset);
  res.json({ rows, total, page, pageSize });
});

r.get('/:id', requirePerm('asset.view', 'consumable.view'), (req, res) => {
  const doc = get(`${DOC_SELECT} WHERE d.id = ?`, req.params.id);
  if (!doc) throw notFound('เอกสาร');
  const lines = [
    ...all(`SELECT 'asset' kind, t.id, a.id ref_id, a.asset_tag code, a.name, c.name category_name, a.serial_no, 1 qty, 'ชิ้น' unit,
              t.cost unit_price, t.action, t.due_date FROM asset_transactions t JOIN assets a ON a.id = t.asset_id
              JOIN categories c ON c.id = a.category_id WHERE t.doc_id = ? ORDER BY t.id`, doc.id),
    ...all(`SELECT 'consumable' kind, m.id, x.id ref_id, x.sku code, x.name, c.name category_name, NULL serial_no, ABS(m.qty) qty, x.unit,
              m.unit_cost unit_price, m.type action, NULL due_date FROM stock_movements m JOIN consumables x ON x.id = m.consumable_id
              JOIN categories c ON c.id = x.category_id WHERE m.doc_id = ? ORDER BY m.id`, doc.id),
  ];
  res.json({ doc, lines });
});

export default r;
