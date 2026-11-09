import { Router } from 'express';
import { all, get, run, now, tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { audit } from '../audit.js';
import { bad, notFound, likeTerm, toInt, toNum } from './util.js';
import { createReceiveDoc } from './documents.js';
import { notify } from '../notify.js';

// รายการรอรับเข้า: rows uploaded from a file wait here until someone receives them (now or later).
// Uploading never touches stock; receiving creates a normal RCV slip via createReceiveDoc(), so stock,
// history and audit follow the same rules as the รับเข้า page. Lines match items by SKU at read time.
// Incomplete lines (no SKU / quantity) are kept too, so they can be fixed on the page instead of re-uploading.
// ลบ = soft delete (deleted_at): the line disappears from every tab; received lines belong to a slip and stay.
// Approved รายการสั่งซื้อ lines land here too (order_line_id): consumables match by SKU like any line; per-unit asset
// lines have no SKU and create new asset units (category/name/brand/model from the order line) when received.
const r = Router();

const MATCH = `
  LEFT JOIN consumables x ON x.sku = p.sku COLLATE NOCASE AND x.deleted_at IS NULL`;
const LIST = `
  SELECT p.id, p.batch_id, p.line_no, p.sku, p.name, p.qty, p.unit_cost, p.status, p.doc_id, p.created_at, p.closed_at, p.deleted_at,
         b.file_name, b.note AS batch_note, u.full_name AS created_by_name, cu.full_name AS closed_by_name, d.doc_no,
         x.id AS item_id, x.name AS item_name, x.unit, x.qty_on_hand, x.unit_cost AS item_unit_cost, p.order_line_id,
         ol.kind AS order_kind, ol.category_id AS order_category_id, ol.brand AS order_brand, ol.model AS order_model,
         o.id AS order_id, o.order_no, p.po_id, po.po_no, po.vendor_id AS po_vendor_id,
         CASE WHEN x.id IS NULL AND EXISTS (SELECT 1 FROM assets a WHERE (a.asset_tag = p.sku COLLATE NOCASE OR a.serial_no = p.sku) AND a.deleted_at IS NULL)
              THEN 1 ELSE 0 END AS is_asset
  FROM pending_receipts p
  JOIN pending_batches b ON b.id = p.batch_id
  LEFT JOIN users u ON u.id = p.created_by
  LEFT JOIN users cu ON cu.id = p.closed_by
  LEFT JOIN documents d ON d.id = p.doc_id
  LEFT JOIN order_lines ol ON ol.id = p.order_line_id
  LEFT JOIN orders o ON o.id = ol.order_id
  LEFT JOIN purchase_orders po ON po.id = p.po_id AND po.status = 'open' ${MATCH}`;

const STATUSES = ['pending', 'received', 'cancelled'];
const SKU_RULE = 'SKU ต้องไม่มีช่องว่าง และยาวไม่เกิน 64 ตัวอักษร';

// state of a pending line: ready (matches a consumable) · new (SKU not in the system yet) · incomplete (problem says why)
function withState(x) {
  if (!x) return x;
  if (x.order_kind === 'asset') return { ...x, problem: x.qty ? null : 'ไม่มีจำนวน', state: x.qty ? 'ready' : 'incomplete' };
  const problem = !x.sku ? 'ไม่มีบาร์โค้ด/SKU'
    : /\s/.test(x.sku) ? SKU_RULE
    : !x.qty ? 'ไม่มีจำนวน'
    : x.is_asset ? 'เป็นอุปกรณ์รายชิ้นที่มีอยู่แล้ว — รับเข้าซ้ำไม่ได้'
    : null;
  return { ...x, problem, state: problem ? 'incomplete' : x.item_id ? 'ready' : 'new' };
}
const qtyOf = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const idList = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger))];

r.get('/', requirePerm('consumable.view'), async (req, res) => {
  const status = STATUSES.includes(req.query.status) ? req.query.status : 'pending';
  // Approved order lines show up here only once they are on a ใบสั่งซื้อ (po_id); until then they wait on /orders?status=items.
  const w = ['p.status = ?', 'p.deleted_at IS NULL', "(p.order_line_id IS NULL OR p.po_id IS NOT NULL OR p.status <> 'pending')"]; const p = [status];
  if (req.query.q) {
    w.push(`(p.sku LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR x.name LIKE ? ESCAPE '\\' OR b.file_name LIKE ? ESCAPE '\\' OR o.order_no LIKE ? ESCAPE '\\' OR po.po_no LIKE ? ESCAPE '\\')`);
    p.push(...Array(6).fill(likeTerm(req.query.q)));
  }
  const rows = (await all(`${LIST} WHERE ${w.join(' AND ')} ORDER BY p.batch_id DESC, p.line_no, p.id LIMIT 2000`, ...p)).map(withState);
  const counts = Object.fromEntries((await all(`SELECT status, COUNT(*) n FROM pending_receipts WHERE deleted_at IS NULL AND (order_line_id IS NULL OR po_id IS NOT NULL OR status <> 'pending') GROUP BY status`)).map((c) => [c.status, c.n]));
  res.json({ rows, counts });
});

// body: { file_name, note, rows: [{ line, sku, name, qty, unit_cost }] } — the browser parses the CSV.
r.post('/upload', requirePerm('consumable.move'), async (req, res) => {
  const b = req.body || {};
  const rows = Array.isArray(b.rows) ? b.rows : [];
  if (!rows.length) throw bad('ไม่พบรายการในไฟล์ — ต้องมีคอลัมน์ บาร์โค้ด/SKU และ จำนวน');
  if (rows.length > 2000) throw bad('อัปโหลดได้ครั้งละไม่เกิน 2,000 แถว — แบ่งไฟล์แล้วอัปโหลดทีละไฟล์');
  const valid = [];
  const notes = [];
  for (const row of rows) {
    const sku = String(row.sku ?? '').trim().slice(0, 64) || null;
    const name = String(row.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 300) || null;
    const qty = qtyOf(row.qty);
    if (!sku && !name && !qty) continue;
    let cost = row.unit_cost === '' || row.unit_cost == null ? null : toNum(row.unit_cost);
    if (cost !== null && (Number.isNaN(cost) || cost < 0)) {
      notes.push({ line: row.line, sku, problem: 'ราคาไม่ถูกต้อง — เว้นราคาไว้ ใส่ภายหลังได้' });
      cost = null;
    }
    valid.push({ line: toInt(row.line), sku, name, qty, cost });
  }
  if (!valid.length) throw bad('ไฟล์ไม่มีข้อมูล — ต้องมีคอลัมน์ บาร์โค้ด/SKU และ จำนวน');
  const batchId = await tx(async () => {
    const id = Number((await run('INSERT INTO pending_batches (file_name, note, created_by) VALUES (?, ?, ?)',
      String(b.file_name || '').slice(0, 260) || null, b.note, req.user.id)).lastInsertRowid);
    for (const v of valid) {
      await run('INSERT INTO pending_receipts (batch_id, line_no, sku, name, qty, unit_cost, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, v.line, v.sku, v.name, v.qty, v.cost, req.user.id);
    }
    await audit(req, 'pending_receipt', id, 'upload', null, { file_name: b.file_name, lines: valid.length });
    return id;
  });
  const lines = (await all(`${LIST} WHERE p.batch_id = ?`, batchId)).map(withState);
  const n = (state) => lines.filter((x) => x.state === state).length;
  res.status(201).json({ batch_id: batchId, added: lines.length, ready: n('ready'), unknown: n('new'), incomplete: n('incomplete'), notes });
});

r.put('/:id', requirePerm('consumable.move'), async (req, res) => {
  const before = await get('SELECT * FROM pending_receipts WHERE id = ? AND deleted_at IS NULL', toInt(req.params.id));
  if (!before) throw notFound('รายการรอรับเข้า');
  if (before.status !== 'pending') throw bad('รายการนี้รับเข้าหรือยกเลิกไปแล้ว แก้ไขไม่ได้');
  const body = req.body || {};
  const v = { sku: before.sku, name: before.name, qty: before.qty, unit_cost: before.unit_cost };
  if (body.sku !== undefined && before.order_line_id) throw bad('แถวที่มาจากรายการสั่งซื้อแก้บาร์โค้ด/SKU ไม่ได้ — แก้ได้เฉพาะจำนวนและราคา');
  if (body.sku !== undefined) {
    v.sku = String(body.sku ?? '').trim();
    if (!v.sku) throw bad('กรุณากรอกบาร์โค้ด/SKU');
    if (v.sku.length > 64 || /\s/.test(v.sku)) throw bad(SKU_RULE);
  }
  if (body.name !== undefined) v.name = String(body.name ?? '').trim().slice(0, 300) || null;
  if (body.qty !== undefined) {
    v.qty = qtyOf(body.qty);
    if (!v.qty) throw bad('จำนวนต้องเป็นจำนวนเต็มที่มากกว่า 0');
  }
  if (body.unit_cost !== undefined) {
    v.unit_cost = body.unit_cost === '' || body.unit_cost === null ? null : toNum(body.unit_cost);
    if (v.unit_cost !== null && (Number.isNaN(v.unit_cost) || v.unit_cost < 0)) throw bad('ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
  }
  await tx(async () => {
    await run('UPDATE pending_receipts SET sku = ?, name = ?, qty = ?, unit_cost = ? WHERE id = ?', v.sku, v.name, v.qty, v.unit_cost, before.id);
    await audit(req, 'pending_receipt', before.id, 'update',
      { sku: before.sku, name: before.name, qty: before.qty, unit_cost: before.unit_cost }, v);
  });
  res.json(withState(await get(`${LIST} WHERE p.id = ?`, before.id)));
});

async function loadPending(ids) {
  if (!ids.length) throw bad('กรุณาเลือกอย่างน้อย 1 รายการ');
  if (ids.length > 500) throw bad('เลือกได้ครั้งละไม่เกิน 500 รายการ');
  const rows = await all(`${LIST} WHERE p.id IN (${ids.map(() => '?').join(',')}) ORDER BY p.batch_id, p.line_no, p.id`, ...ids);
  if (rows.length !== ids.length || rows.some((x) => x.status !== 'pending' || x.deleted_at)) {
    throw bad('บางรายการถูกรับเข้าหรือยกเลิกไปแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง');
  }
  const noPo = rows.find((x) => x.order_line_id && !x.po_id);
  if (noPo) throw bad(`${noPo.name} (${noPo.order_no}) ยังไม่ได้ออกใบสั่งซื้อ — ออกใบสั่งซื้อที่ รายการสั่งซื้อ › รอออกใบสั่งซื้อ ก่อน`);
  return rows.map(withState);
}

// Receive the ticked lines as one RCV slip. body: { ids, doc_date, vendor_id, location_id, po_number, invoice_number, note }
r.post('/receive', requirePerm('consumable.move'), async (req, res) => {
  const b = req.body || {};
  const ids = idList(b.ids);
  const result = await tx(async () => {
    const rows = await loadPending(ids);
    const incomplete = rows.filter((x) => x.state === 'incomplete');
    if (incomplete.length) {
      throw bad(`${incomplete.length} รายการข้อมูลไม่ครบ (${incomplete.slice(0, 3).map((x) => `แถว ${x.line_no ?? '-'}: ${x.problem}`).join(', ')}${incomplete.length > 3 ? ', …' : ''}) — แก้ไขก่อน หรือเอาเครื่องหมายออก`);
    }
    const missing = rows.filter((x) => x.state === 'new');
    if (missing.length) {
      throw bad(`${missing.length} รายการยังไม่มีในระบบ (${missing.slice(0, 3).map((x) => x.sku).join(', ')}${missing.length > 3 ? ', …' : ''}) — สร้างรายการใหม่ก่อน หรือเอาเครื่องหมายออก`);
    }
    const sources = [...new Set(rows.map((x) => x.order_no || x.file_name).filter(Boolean))];
    const orders = [...new Set(rows.map((x) => x.order_no).filter(Boolean))];
    const pos = [...new Set(rows.map((x) => x.po_no || null))];
    const po = pos.length === 1 && pos[0] ? rows[0] : null;
    const doc = await createReceiveDoc(req, {
      doc_date: b.doc_date, vendor_id: b.vendor_id || po?.po_vendor_id, location_id: b.location_id, invoice_number: b.invoice_number,
      po_number: b.po_number || po?.po_no || (orders.length === 1 ? orders[0] : null),
      note: b.note || (sources.length ? `จากรายการรอรับเข้า: ${sources.join(', ')}` : 'จากรายการรอรับเข้า'),
      lines: rows.map((x) => (x.order_kind === 'asset'
        ? { kind: 'asset', category_id: x.order_category_id, name: x.name, brand: x.order_brand || null, model: x.order_model || null, qty: x.qty, unit_price: x.unit_cost }
        : { kind: 'consumable', consumable_id: x.item_id, qty: x.qty, unit_cost: x.unit_cost ?? x.item_unit_cost })),
    });
    await run(`UPDATE pending_receipts SET status = 'received', doc_id = ?, closed_by = ?, closed_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
      doc.id, req.user.id, now(), ...ids);
    await audit(req, 'pending_receipt', null, 'receive', null, { ids, doc_no: doc.doc_no });
    for (const orderId of new Set(rows.map((x) => x.order_id).filter(Boolean))) {
      const o = await get(`SELECT o.id, o.order_no, o.requested_by,
          (SELECT COUNT(*) FROM pending_receipts pr JOIN order_lines ol ON ol.id = pr.order_line_id
           WHERE ol.order_id = o.id AND pr.status = 'pending' AND pr.deleted_at IS NULL) AS waiting
        FROM orders o WHERE o.id = ?`, orderId);
      const n = rows.filter((x) => x.order_id === orderId).length;
      await notify(req, o.requested_by, {
        kind: 'order.received', title: `ของตามรายการสั่งซื้อ ${o.order_no} เข้าสต็อกแล้ว`, link: `/orders/${o.id}`,
        body: o.waiting ? `รับเข้า ${n} รายการ · ยังรออีก ${o.waiting} รายการ` : `รับเข้าครบแล้ว · รอส่งมอบ`,
      });
    }
    return doc;
  });
  res.status(201).json(result);
});

r.post('/cancel', requirePerm('consumable.move'), async (req, res) => {
  const ids = idList(req.body?.ids);
  await tx(async () => {
    await loadPending(ids);
    await run(`UPDATE pending_receipts SET status = 'cancelled', closed_by = ?, closed_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
      req.user.id, now(), ...ids);
    await audit(req, 'pending_receipt', null, 'cancel', null, { ids, reason: req.body?.reason || null });
  });
  res.json({ ok: true, count: ids.length });
});

// body: { ids } — pending or cancelled lines only
r.post('/delete', requirePerm('consumable.move'), async (req, res) => {
  const ids = idList(req.body?.ids);
  if (!ids.length) throw bad('กรุณาเลือกอย่างน้อย 1 รายการ');
  if (ids.length > 500) throw bad('เลือกได้ครั้งละไม่เกิน 500 รายการ');
  await tx(async () => {
    const rows = await all(`SELECT id, status, sku, qty FROM pending_receipts WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`, ...ids);
    if (rows.length !== ids.length) throw bad('บางรายการถูกลบไปแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง');
    if (rows.some((x) => x.status === 'received')) throw bad('รายการที่รับเข้าแล้วลบไม่ได้ — อยู่ในใบรับเข้าแล้ว');
    await run(`UPDATE pending_receipts SET deleted_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`, now(), ...ids);
    for (const x of rows) await audit(req, 'pending_receipt', x.id, 'delete', x, null);
  });
  res.json({ ok: true, count: ids.length });
});

export default r;
