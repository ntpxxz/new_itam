import { Router } from 'express';
import { all, get, run, tx, now } from '../db.js';
import { requirePerm, can } from '../auth.js';
import { audit } from '../audit.js';
import { HttpError, bad, notFound, likeTerm, today, toInt } from './util.js';
import { createIssueDoc, createReceiveDoc } from './documents.js';
import { resolveRecipient } from '../recipient.js';

// ใบสั่งซื้อ: cart → pending → (admin) approved → goods arrive: RCV slip (stage "received") → handed over: ISS slip (delivered).
// Only registered items can be ordered, at any stock level. "received" is approved + receive_doc_id (no extra status value).
const r = Router();
const STAGES = ['pending', 'approved', 'received', 'delivered', 'rejected', 'cancelled'];
const ANY = requirePerm('order.create', 'order.manage');
const MAX_QTY = 9999;

const keyOf = (l) => (l.kind === 'consumable' ? `c:${l.consumable_id}` : `a:${l.category_id}:${l.name}\u0001${l.brand || ''}\u0001${l.model || ''}`);

// Every registered item: consumables, and per-unit assets grouped by category/name/brand/model (scrapped excluded).
async function catalog() {
  const rows = await all(`SELECT * FROM (
      SELECT 'consumable' AS kind, c.id AS consumable_id, c.category_id, k.name AS category_name, c.name, '' AS brand, '' AS model,
             c.sku AS code, c.unit, c.image_path, c.qty_on_hand AS on_hand, c.unit_cost AS last_price
      FROM consumables c JOIN categories k ON k.id = c.category_id WHERE c.deleted_at IS NULL
      UNION ALL
      SELECT 'asset' AS kind, NULL AS consumable_id, a.category_id, k.name AS category_name, a.name, COALESCE(a.brand, '') AS brand,
             COALESCE(a.model, '') AS model, NULL AS code, 'เครื่อง' AS unit, MAX(a.image_path) AS image_path,
             SUM(CASE WHEN a.status = 'available' THEN 1 ELSE 0 END) AS on_hand, MAX(a.purchase_price) AS last_price
      FROM assets a JOIN categories k ON k.id = a.category_id WHERE a.deleted_at IS NULL AND a.status <> 'scrapped'
      GROUP BY a.category_id, k.name, a.name, COALESCE(a.brand, ''), COALESCE(a.model, '')
    ) x ORDER BY x.category_name, x.name`);
  return rows.map((x) => ({ ...x, key: keyOf(x) }));
}

async function nextOrderNo() {
  const d = today();
  const base = `ORD-${d.slice(0, 4)}${d.slice(5, 7)}-`;
  const row = await get('SELECT order_no FROM orders WHERE order_no LIKE ? ORDER BY order_no DESC LIMIT 1', base + '%');
  return base + String(row ? parseInt(row.order_no.slice(base.length), 10) + 1 : 1).padStart(4, '0');
}

const STAGE = `CASE WHEN o.status = 'approved' AND o.receive_doc_id IS NOT NULL THEN 'received' ELSE o.status END`;
const ORDER_SELECT = `
  SELECT o.*, ${STAGE} AS stage, p.name AS person_name, dp.name AS department_name, u.full_name AS requested_by_name,
         ru.full_name AS reviewed_by_name, rc.full_name AS received_by_name, du.full_name AS delivered_by_name,
         d.doc_no, rd.doc_no AS receive_doc_no,
         (SELECT COUNT(*) FROM order_lines l WHERE l.order_id = o.id) AS line_count,
         (SELECT COALESCE(SUM(COALESCE(l.approved_qty, l.qty)), 0) FROM order_lines l WHERE l.order_id = o.id) AS unit_count
  FROM orders o
  LEFT JOIN people p ON p.id = o.person_id LEFT JOIN departments dp ON dp.id = o.department_id
  LEFT JOIN users u ON u.id = o.requested_by LEFT JOIN users ru ON ru.id = o.reviewed_by LEFT JOIN users rc ON rc.id = o.received_by
  LEFT JOIN users du ON du.id = o.delivered_by LEFT JOIN documents d ON d.id = o.doc_id LEFT JOIN documents rd ON rd.id = o.receive_doc_id`;

async function loadOrder(req, id) {
  const o = await get(`${ORDER_SELECT} WHERE o.id = ?`, toInt(id));
  if (!o || (!can(req.user, 'order.manage') && o.requested_by !== req.user.id)) throw notFound('ใบสั่งซื้อ');
  return o;
}

r.get('/catalog', ANY, async (req, res) => {
  res.json({ rows: await catalog() });
});

// body: { person_name, department_name, note, lines: [{ kind, consumable_id | category_id+name+brand+model, qty }] }
r.post('/', requirePerm('order.create'), async (req, res) => {
  const b = req.body || {};
  const lines = Array.isArray(b.lines) ? b.lines : [];
  if (!lines.length) throw bad('ตะกร้าว่าง — เลือกสินค้าอย่างน้อย 1 รายการ');
  if (lines.length > 100) throw bad('สั่งได้ครั้งละไม่เกิน 100 รายการ');
  const result = await tx(async () => {
    const items = new Map((await catalog()).map((x) => [x.key, x]));
    const seen = new Set();
    const clean = lines.map((l, i) => {
      const key = keyOf({ ...l, name: String(l.name ?? '') });
      const item = items.get(key);
      const qty = Number(l.qty);
      if (!item) throw bad(`รายการที่ ${i + 1}: ไม่พบสินค้านี้ในระบบ — สินค้าใหม่ต้องลงทะเบียนก่อน`);
      if (seen.has(key)) throw bad(`รายการที่ ${i + 1}: ${item.name} ซ้ำในตะกร้า`);
      seen.add(key);
      if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw bad(`รายการที่ ${i + 1}: จำนวนต้องเป็นจำนวนเต็ม 1–${MAX_QTY}`);
      if (item.kind === 'asset' && qty > 200) throw bad(`รายการที่ ${i + 1}: อุปกรณ์รายชิ้นสั่งได้ไม่เกิน 200 เครื่องต่อรายการ`);
      return { ...item, qty };
    });
    const who = await resolveRecipient(req, { person_name: b.person_name || req.user.full_name, department_name: b.department_name });
    const order_no = await nextOrderNo();
    const id = Number((await run('INSERT INTO orders (order_no, person_id, department_id, note, requested_by) VALUES (?, ?, ?, ?, ?)',
      order_no, who.person_id, who.department_id, b.note, req.user.id)).lastInsertRowid);
    for (const l of clean) {
      await run(`INSERT INTO order_lines (order_id, kind, consumable_id, category_id, name, brand, model, qty, unit_price) VALUES (?, ?, ?, ?, ?, COALESCE(?, ''), COALESCE(?, ''), ?, ?)`,
        id, l.kind, l.consumable_id, l.category_id, l.name, l.brand, l.model, l.qty, l.last_price);
    }
    await audit(req, 'order', id, 'create', null, { order_no, lines: clean.length });
    return { id, order_no };
  });
  res.status(201).json(result);
});

r.get('/', ANY, async (req, res) => {
  const w = ['1=1']; const p = [];
  if (!can(req.user, 'order.manage') || req.query.mine === '1') { w.push('o.requested_by = ?'); p.push(req.user.id); }
  const base = [...w]; const baseP = [...p];
  if (STAGES.includes(req.query.status)) { w.push(`${STAGE} = ?`); p.push(req.query.status); }
  if (req.query.q) { w.push(`(o.order_no LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR dp.name LIKE ? ESCAPE '\\')`); p.push(...Array(3).fill(likeTerm(req.query.q))); }
  const rows = await all(`${ORDER_SELECT} WHERE ${w.join(' AND ')} ORDER BY o.id DESC LIMIT 500`, ...p);
  const counts = Object.fromEntries((await all(`SELECT x.stage, COUNT(*) n FROM (SELECT ${STAGE} AS stage FROM orders o WHERE ${base.join(' AND ')}) x GROUP BY x.stage`, ...baseP))
    .map((c) => [c.stage, c.n]));
  res.json({ rows, counts });
});

r.get('/:id', ANY, async (req, res) => {
  const order = await loadOrder(req, req.params.id);
  const items = new Map((await catalog()).map((x) => [x.key, x]));
  const lines = (await all(`SELECT l.*, k.name AS category_name, c.sku AS code, c.unit, c.image_path
    FROM order_lines l LEFT JOIN categories k ON k.id = l.category_id LEFT JOIN consumables c ON c.id = l.consumable_id
    WHERE l.order_id = ? ORDER BY l.id`, order.id)).map((l) => {
    const s = items.get(keyOf(l));
    return { ...l, unit: l.unit || 'เครื่อง', image_path: l.image_path || s?.image_path || null, on_hand: s?.on_hand ?? 0 };
  });
  res.json({ order, lines });
});

// Before the goods are received only; afterwards they are in stock and must be handed over or issued normally.
r.post('/:id/cancel', ANY, async (req, res) => {
  await tx(async () => {
    const o = await loadOrder(req, req.params.id);
    if (o.stage !== 'pending' && !(o.stage === 'approved' && can(req.user, 'order.manage'))) {
      throw bad(o.stage === 'received' ? 'รับของเข้าสต็อกแล้ว ยกเลิกไม่ได้ — ส่งมอบ หรือเบิกออกตามปกติ' : 'ยกเลิกได้เฉพาะใบสั่งซื้อที่ยังไม่รับของ');
    }
    await run(`UPDATE orders SET status = 'cancelled', cancelled_at = ? WHERE id = ?`, now(), o.id);
    await audit(req, 'order', o.id, 'cancel', { status: o.status }, { status: 'cancelled', reason: req.body?.reason || null });
  });
  res.json({ ok: true });
});

// body: { lines: [{ id, approved_qty }], review_note } — quantities may be lowered (0 = not approved)
r.post('/:id/approve', requirePerm('order.manage'), async (req, res) => {
  await tx(async () => {
    const o = await loadOrder(req, req.params.id);
    if (o.status !== 'pending') throw bad('อนุมัติได้เฉพาะใบสั่งซื้อที่รอตรวจสอบ');
    const lines = await all('SELECT * FROM order_lines WHERE order_id = ? ORDER BY id', o.id);
    const given = new Map((Array.isArray(req.body?.lines) ? req.body.lines : []).map((l) => [toInt(l.id), l.approved_qty]));
    let total = 0;
    for (const [i, l] of lines.entries()) {
      const q = given.has(l.id) ? Number(given.get(l.id)) : l.qty;
      if (!Number.isInteger(q) || q < 0 || q > l.qty) throw bad(`รายการที่ ${i + 1}: จำนวนอนุมัติต้องอยู่ระหว่าง 0–${l.qty}`);
      await run('UPDATE order_lines SET approved_qty = ? WHERE id = ?', q, l.id);
      total += q;
    }
    if (!total) throw bad('ต้องอนุมัติอย่างน้อย 1 รายการ — ถ้าไม่อนุมัติทั้งหมด ให้กด “ไม่อนุมัติ”');
    await run(`UPDATE orders SET status = 'approved', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?`, req.user.id, now(), req.body?.review_note || null, o.id);
    await audit(req, 'order', o.id, 'approve', { status: 'pending' }, { status: 'approved', units: total });
  });
  res.json({ ok: true });
});

r.post('/:id/reject', requirePerm('order.manage'), async (req, res) => {
  const note = String(req.body?.review_note || '').trim();
  if (!note) throw bad('กรุณาระบุเหตุผลที่ไม่อนุมัติ');
  await tx(async () => {
    const o = await loadOrder(req, req.params.id);
    if (o.status !== 'pending') throw bad('ไม่อนุมัติได้เฉพาะใบสั่งซื้อที่รอตรวจสอบ');
    await run(`UPDATE orders SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?`, req.user.id, now(), note, o.id);
    await audit(req, 'order', o.id, 'reject', { status: 'pending' }, { status: 'rejected', review_note: note });
  });
  res.json({ ok: true });
});

// Goods arrived: one RCV slip for the approved quantities (stock in / new asset units).
// body: { doc_date, purchase_date, vendor_id, location_id, po_number, invoice_number, note, lines: [{ id, unit_price }] }
r.post('/:id/receive', requirePerm('order.manage'), async (req, res) => {
  const b = req.body || {};
  const result = await tx(async () => {
    const o = await loadOrder(req, req.params.id);
    if (o.stage !== 'approved') throw bad(o.stage === 'received' ? 'ใบสั่งซื้อนี้รับของแล้ว' : 'รับของได้เฉพาะใบสั่งซื้อที่อนุมัติแล้ว');
    const prices = new Map((Array.isArray(b.lines) ? b.lines : []).map((l) => [toInt(l.id), l.unit_price]));
    const docLines = [];
    for (const [i, l] of (await all('SELECT * FROM order_lines WHERE order_id = ? AND approved_qty > 0 ORDER BY id', o.id)).entries()) {
      const raw = prices.has(l.id) ? prices.get(l.id) : l.unit_price;
      const price = raw === '' || raw == null ? null : Number(raw);
      if (price != null && !(price >= 0)) throw bad(`รายการที่ ${i + 1}: ราคาต่อหน่วยไม่ถูกต้อง`);
      await run('UPDATE order_lines SET unit_price = ? WHERE id = ?', price, l.id);
      docLines.push(l.kind === 'consumable'
        ? { kind: 'consumable', consumable_id: l.consumable_id, qty: l.approved_qty, unit_cost: price }
        : { kind: 'asset', category_id: l.category_id, name: l.name, brand: l.brand || null, model: l.model || null, qty: l.approved_qty, unit_price: price });
    }
    const doc = await createReceiveDoc(req, {
      doc_date: b.doc_date || today(), purchase_date: b.purchase_date || null, vendor_id: b.vendor_id, location_id: b.location_id,
      po_number: b.po_number || o.order_no, invoice_number: b.invoice_number,
      note: [`ใบสั่งซื้อ ${o.order_no}`, b.note].filter(Boolean).join(' · '), lines: docLines,
    });
    await run('UPDATE orders SET received_by = ?, received_at = ?, receive_doc_id = ? WHERE id = ?', req.user.id, now(), doc.id, o.id);
    await audit(req, 'order', o.id, 'receive', { stage: 'approved' }, { stage: 'received', doc_no: doc.doc_no });
    return doc;
  });
  res.status(201).json(result);
});

// Hand the received goods to the requester: one ISS slip; asset lines take the units created by this order's RCV slip.
r.post('/:id/deliver', requirePerm('order.manage'), async (req, res) => {
  const result = await tx(async () => {
    const o = await loadOrder(req, req.params.id);
    if (o.stage !== 'received') throw bad(o.stage === 'approved' ? 'ต้องรับของเข้าก่อน จึงจะส่งมอบได้' : 'ส่งมอบได้เฉพาะใบสั่งซื้อที่รับของแล้ว');
    const docLines = [];
    for (const l of await all('SELECT * FROM order_lines WHERE order_id = ? AND approved_qty > 0 ORDER BY id', o.id)) {
      if (l.kind === 'consumable') { docLines.push({ kind: 'consumable', consumable_id: l.consumable_id, qty: l.approved_qty }); continue; }
      const units = await all(`SELECT a.id FROM assets a WHERE a.deleted_at IS NULL AND a.status = 'available' AND a.category_id = ? AND a.name = ?
        AND COALESCE(a.brand, '') = COALESCE(?, '') AND COALESCE(a.model, '') = COALESCE(?, '')
        AND a.id IN (SELECT t.asset_id FROM asset_transactions t WHERE t.doc_id = ?) ORDER BY a.id LIMIT ?`,
      l.category_id, l.name, l.brand, l.model, o.receive_doc_id, l.approved_qty);
      if (units.length < l.approved_qty) throw new HttpError(400, `${l.name}: เครื่องที่รับเข้าจากใบสั่งซื้อนี้พร้อมใช้เหลือ ${units.length} จาก ${l.approved_qty} เครื่อง — ตรวจสอบสถานะเครื่องก่อนส่งมอบ`);
      for (const u of units) docLines.push({ kind: 'asset', asset_id: u.id });
    }
    const doc = await createIssueDoc(req, {
      mode: 'issue', doc_date: req.body?.doc_date || today(), person_name: o.person_name, department_name: o.department_name,
      note: [`ใบสั่งซื้อ ${o.order_no}`, req.body?.note || o.note].filter(Boolean).join(' · '), lines: docLines,
    });
    await run(`UPDATE orders SET status = 'delivered', delivered_by = ?, delivered_at = ?, doc_id = ? WHERE id = ?`, req.user.id, now(), doc.id, o.id);
    await audit(req, 'order', o.id, 'deliver', { stage: 'received' }, { status: 'delivered', doc_no: doc.doc_no });
    return doc;
  });
  res.status(201).json(result);
});

export default r;
