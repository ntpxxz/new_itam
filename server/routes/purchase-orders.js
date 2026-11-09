import { Router } from 'express';
import { all, get, run, tx, now } from '../db.js';
import { requirePerm } from '../auth.js';
import { audit } from '../audit.js';
import { bad, notFound, likeTerm, today, toInt, toNum, isDate } from './util.js';
import { notify } from '../notify.js';

// ใบสั่งซื้อ to a vendor, built from approved รายการสั่งซื้อ lines that still wait in รายการรอรับเข้า (pending_receipts with an
// order_line_id). A PO only tags those lines (po_id) and sets their price; they are still received on /pending-receive,
// where the RCV slip takes the PO no. and vendor. Cancelling a PO (nothing received yet) frees its lines for another PO.
const r = Router();
const MANAGE = requirePerm('order.manage');

const LINES = `
  SELECT p.id, p.sku, p.name, p.qty, p.unit_cost, p.status, p.doc_id, d.doc_no, p.po_id, p.line_no, p.created_at,
         ol.kind, ol.consumable_id, ol.brand, ol.model, ol.category_id, k.name AS category_name, c.unit,
         o.id AS order_id, o.order_no, o.requested_by, rp.name AS person_name, rd.name AS department_name
  FROM pending_receipts p
  JOIN order_lines ol ON ol.id = p.order_line_id
  JOIN orders o ON o.id = ol.order_id
  LEFT JOIN categories k ON k.id = ol.category_id
  LEFT JOIN consumables c ON c.id = ol.consumable_id
  LEFT JOIN people rp ON rp.id = o.person_id
  LEFT JOIN departments rd ON rd.id = o.department_id
  LEFT JOIN documents d ON d.id = p.doc_id
  WHERE p.deleted_at IS NULL`;
const withUnit = (l) => ({ ...l, unit: l.unit || 'เครื่อง' });

const PO_SELECT = `
  SELECT po.*, v.name AS vendor_name, v.contact AS vendor_contact, v.phone AS vendor_phone, v.email AS vendor_email,
         u.full_name AS created_by_name, cu.full_name AS cancelled_by_name,
         (SELECT COUNT(*) FROM pending_receipts p WHERE p.po_id = po.id AND p.deleted_at IS NULL) AS line_count,
         (SELECT COALESCE(SUM(p.qty), 0) FROM pending_receipts p WHERE p.po_id = po.id AND p.deleted_at IS NULL AND p.status <> 'cancelled') AS unit_count,
         (SELECT COALESCE(SUM(p.qty * COALESCE(p.unit_cost, 0)), 0) FROM pending_receipts p WHERE p.po_id = po.id AND p.deleted_at IS NULL AND p.status <> 'cancelled') AS total,
         (SELECT COUNT(*) FROM pending_receipts p WHERE p.po_id = po.id AND p.deleted_at IS NULL AND p.status = 'pending') AS waiting,
         (SELECT COUNT(*) FROM pending_receipts p WHERE p.po_id = po.id AND p.deleted_at IS NULL AND p.status = 'received') AS received
  FROM purchase_orders po
  JOIN vendors v ON v.id = po.vendor_id
  LEFT JOIN users u ON u.id = po.created_by
  LEFT JOIN users cu ON cu.id = po.cancelled_by`;

// open → partial (some lines received) → received (nothing left waiting) · cancelled
const progress = (po) => ({
  ...po,
  state: po.status === 'cancelled' ? 'cancelled' : po.line_count && !po.waiting ? 'received' : po.received ? 'partial' : 'open',
});

async function nextPoNo(date) {
  const base = `PO-${date.slice(0, 4)}${date.slice(5, 7)}-`;
  const row = await get('SELECT po_no FROM purchase_orders WHERE po_no LIKE ? ORDER BY po_no DESC LIMIT 1', base + '%');
  return base + String(row ? parseInt(row.po_no.slice(base.length), 10) + 1 : 1).padStart(4, '0');
}

// Approved order lines still waiting in รอรับเข้า and not on an open PO yet.
r.get('/available', MANAGE, async (req, res) => {
  const rows = await all(`${LINES} AND p.status = 'pending' AND p.po_id IS NULL ORDER BY o.id, p.line_no, p.id`);
  res.json({ rows: rows.map(withUnit) });
});

r.get('/', MANAGE, async (req, res) => {
  const w = ['1=1']; const p = [];
  if (req.query.q) { w.push(`(po.po_no LIKE ? ESCAPE '\\' OR v.name LIKE ? ESCAPE '\\')`); p.push(likeTerm(req.query.q), likeTerm(req.query.q)); }
  const rows = await all(`${PO_SELECT} WHERE ${w.join(' AND ')} ORDER BY po.id DESC LIMIT 500`, ...p);
  res.json({ rows: rows.map(progress) });
});

r.get('/:id', MANAGE, async (req, res) => {
  const po = await get(`${PO_SELECT} WHERE po.id = ?`, toInt(req.params.id));
  if (!po) throw notFound('ใบสั่งซื้อ');
  const lines = await all(`${LINES} AND p.po_id = ? ORDER BY o.id, p.line_no, p.id`, po.id);
  res.json({ po: progress(po), lines: lines.map(withUnit) });
});

// body: { vendor_id, doc_date, note, lines: [{ id, unit_cost }] } — ids are pending_receipts rows from /available
r.post('/', MANAGE, async (req, res) => {
  const b = req.body || {};
  const vendorId = toInt(b.vendor_id);
  const docDate = b.doc_date || today();
  if (!isDate(docDate) || docDate > today()) throw bad('วันที่ PO ต้องเป็นวันที่ที่ถูกต้อง และไม่เป็นวันในอนาคต');
  const given = Array.isArray(b.lines) ? b.lines : [];
  const ids = [...new Set(given.map((l) => toInt(l.id)).filter(Boolean))];
  if (!ids.length) throw bad('กรุณาเลือกอย่างน้อย 1 รายการ');
  if (ids.length > 500) throw bad('เลือกได้ครั้งละไม่เกิน 500 รายการ');
  const prices = new Map(given.map((l) => [toInt(l.id), l.unit_cost]));
  const result = await tx(async () => {
    const vendor = await get('SELECT id, name FROM vendors WHERE id = ? AND deleted_at IS NULL', vendorId);
    if (!vendor) throw bad('กรุณาเลือกผู้ขาย — เพิ่มผู้ขายใหม่ได้ที่ ข้อมูลหลัก › ผู้ขาย');
    const rows = await all(`${LINES} AND p.id IN (${ids.map(() => '?').join(',')}) ORDER BY o.id, p.line_no, p.id`, ...ids);
    if (rows.length !== ids.length || rows.some((x) => x.status !== 'pending' || x.po_id)) {
      throw bad('บางรายการถูกรับเข้า ยกเลิก หรืออยู่ในใบสั่งซื้ออื่นแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง');
    }
    const po_no = await nextPoNo(docDate);
    const id = Number((await run('INSERT INTO purchase_orders (po_no, doc_date, vendor_id, note, created_by) VALUES (?, ?, ?, ?, ?)',
      po_no, docDate, vendor.id, b.note || null, req.user.id)).lastInsertRowid);
    for (const [i, x] of rows.entries()) {
      const raw = prices.get(x.id);
      let cost = x.unit_cost;
      if (raw !== undefined) {
        cost = raw === '' || raw === null ? null : toNum(raw);
        if (cost !== null && (Number.isNaN(cost) || cost < 0)) throw bad(`รายการที่ ${i + 1} (${x.name}): ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป`);
      }
      await run('UPDATE pending_receipts SET po_id = ?, unit_cost = ? WHERE id = ?', id, cost, x.id);
    }
    await audit(req, 'purchase_order', id, 'create', null, { po_no, vendor: vendor.name, lines: ids });
    for (const orderId of new Set(rows.map((x) => x.order_id))) {
      const mine = rows.filter((x) => x.order_id === orderId);
      await notify(req, mine[0].requested_by, {
        kind: 'order.purchased', title: `สั่งซื้อของตามรายการสั่งซื้อ ${mine[0].order_no} กับผู้ขายแล้ว`, link: `/orders/${orderId}`,
        body: `${po_no} · ${vendor.name} · ${mine.length} รายการ`,
      });
    }
    return { id, po_no };
  });
  res.status(201).json(result);
});

r.post('/:id/cancel', MANAGE, async (req, res) => {
  await tx(async () => {
    const po = await get(`${PO_SELECT} WHERE po.id = ?`, toInt(req.params.id));
    if (!po) throw notFound('ใบสั่งซื้อ');
    if (po.status === 'cancelled') throw bad('ใบสั่งซื้อนี้ถูกยกเลิกไปแล้ว');
    if (po.received) throw bad('บางรายการในใบสั่งซื้อนี้รับเข้าแล้ว ยกเลิกไม่ได้ — ยกเลิกเฉพาะรายการที่เหลือได้ที่เมนู “รอรับเข้า”');
    const freed = (await all(`SELECT id FROM pending_receipts WHERE po_id = ? AND status = 'pending' AND deleted_at IS NULL`, po.id)).map((x) => x.id);
    await run(`UPDATE pending_receipts SET po_id = NULL WHERE po_id = ? AND status = 'pending'`, po.id);
    await run(`UPDATE purchase_orders SET status = 'cancelled', cancelled_by = ?, cancelled_at = ? WHERE id = ?`, req.user.id, now(), po.id);
    await audit(req, 'purchase_order', po.id, 'cancel', { status: po.status }, { status: 'cancelled', freed, reason: req.body?.reason || null });
  });
  res.json({ ok: true });
});

export default r;
