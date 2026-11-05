import { Router } from 'express';
import { all, get, run, tx, now } from '../db.js';
import { requirePerm, can } from '../auth.js';
import { audit } from '../audit.js';
import { bad, notFound, likeTerm, today, toInt } from './util.js';
import { resolveRecipient } from '../recipient.js';

// ใบสั่งซื้อ: cart → pending → (admin) approved or rejected. Approving moves the approved lines to รายการรอรับเข้า
// (pending_receipts.order_line_id), where the goods are received as a normal RCV slip. Any registered item, any stock level.
const r = Router();
const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
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

const RECEIPTS = `SELECT pr.id, pr.status FROM pending_receipts pr JOIN order_lines ol ON ol.id = pr.order_line_id WHERE pr.deleted_at IS NULL`;
const ORDER_SELECT = `
  SELECT o.*, p.name AS person_name, dp.name AS department_name, u.full_name AS requested_by_name, ru.full_name AS reviewed_by_name,
         (SELECT COUNT(*) FROM order_lines l WHERE l.order_id = o.id) AS line_count,
         (SELECT COALESCE(SUM(COALESCE(l.approved_qty, l.qty)), 0) FROM order_lines l WHERE l.order_id = o.id) AS unit_count,
         (SELECT COUNT(*) FROM pending_receipts pr JOIN order_lines ol ON ol.id = pr.order_line_id
          WHERE pr.deleted_at IS NULL AND pr.status = 'pending' AND ol.order_id = o.id) AS awaiting_lines
  FROM orders o
  LEFT JOIN people p ON p.id = o.person_id LEFT JOIN departments dp ON dp.id = o.department_id
  LEFT JOIN users u ON u.id = o.requested_by LEFT JOIN users ru ON ru.id = o.reviewed_by`;

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
  if (STATUSES.includes(req.query.status)) { w.push('o.status = ?'); p.push(req.query.status); }
  if (req.query.q) { w.push(`(o.order_no LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR dp.name LIKE ? ESCAPE '\\')`); p.push(...Array(3).fill(likeTerm(req.query.q))); }
  const rows = await all(`${ORDER_SELECT} WHERE ${w.join(' AND ')} ORDER BY o.id DESC LIMIT 500`, ...p);
  const counts = Object.fromEntries((await all(`SELECT o.status, COUNT(*) n FROM orders o WHERE ${base.join(' AND ')} GROUP BY o.status`, ...baseP))
    .map((c) => [c.status, c.n]));
  res.json({ rows, counts });
});

r.get('/:id', ANY, async (req, res) => {
  const order = await loadOrder(req, req.params.id);
  const items = new Map((await catalog()).map((x) => [x.key, x]));
  const lines = (await all(`SELECT l.*, k.name AS category_name, c.sku AS code, c.unit, c.image_path,
           pr.status AS receipt_status, pr.qty AS receipt_qty, pr.doc_id AS receipt_doc_id, d.doc_no AS receipt_doc_no
    FROM order_lines l LEFT JOIN categories k ON k.id = l.category_id LEFT JOIN consumables c ON c.id = l.consumable_id
    LEFT JOIN pending_receipts pr ON pr.order_line_id = l.id AND pr.deleted_at IS NULL LEFT JOIN documents d ON d.id = pr.doc_id
    WHERE l.order_id = ? ORDER BY l.id`, order.id)).map((l) => {
    const s = items.get(keyOf(l));
    return { ...l, unit: l.unit || 'เครื่อง', image_path: l.image_path || s?.image_path || null, on_hand: s?.on_hand ?? 0 };
  });
  res.json({ order, lines });
});

// Requester: while pending. Managers: also once approved, as long as nothing was received; its waiting lines are cancelled too.
r.post('/:id/cancel', ANY, async (req, res) => {
  await tx(async () => {
    const o = await loadOrder(req, req.params.id);
    if (o.status !== 'pending' && !(o.status === 'approved' && can(req.user, 'order.manage'))) {
      throw bad('ยกเลิกได้เฉพาะใบสั่งซื้อที่รอตรวจสอบ หรืออนุมัติแล้วแต่ยังไม่รับเข้า');
    }
    if (o.status === 'approved') {
      if ((await get(`SELECT COUNT(*) n FROM (${RECEIPTS} AND ol.order_id = ? AND pr.status = 'received') x`, o.id)).n) {
        throw bad('บางรายการรับเข้าสต็อกแล้ว ยกเลิกใบสั่งซื้อไม่ได้ — ยกเลิกรายการที่เหลือได้ที่เมนู “รอรับเข้า”');
      }
      await run(`UPDATE pending_receipts SET status = 'cancelled', closed_by = ?, closed_at = ?
        WHERE status = 'pending' AND order_line_id IN (SELECT id FROM order_lines WHERE order_id = ?)`, req.user.id, now(), o.id);
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
    const batch = Number((await run('INSERT INTO pending_batches (note, created_by) VALUES (?, ?)', `ใบสั่งซื้อ ${o.order_no}`, req.user.id)).lastInsertRowid);
    const approved = await all(`SELECT l.*, c.sku FROM order_lines l LEFT JOIN consumables c ON c.id = l.consumable_id
      WHERE l.order_id = ? AND l.approved_qty > 0 ORDER BY l.id`, o.id);
    for (const [i, l] of approved.entries()) {
      await run('INSERT INTO pending_receipts (batch_id, line_no, sku, name, qty, unit_cost, created_by, order_line_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        batch, i + 1, l.sku || null, l.name, l.approved_qty, l.unit_price, req.user.id, l.id);
    }
    await audit(req, 'order', o.id, 'approve', { status: 'pending' }, { status: 'approved', units: total, pending_batch: batch });
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

export default r;
