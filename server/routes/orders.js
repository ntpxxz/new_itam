import { Router } from 'express';
import { all, get, run, tx, now } from '../db.js';
import { requirePerm, can } from '../auth.js';
import { audit } from '../audit.js';
import { HttpError, bad, notFound, likeTerm, today, toInt } from './util.js';
import { createIssueDoc } from './documents.js';
import { resolveRecipient } from '../recipient.js';

// คำสั่งเบิก: cart → pending → (admin) approved = awaiting delivery → delivered (ISS slip via createIssueDoc).
// Only registered items can be ordered. Approved, undelivered quantities are reserved from the shown stock.
const r = Router();
const STATUSES = ['pending', 'approved', 'delivered', 'rejected', 'cancelled'];
const ANY = requirePerm('order.create', 'order.manage');

const keyOf = (l) => (l.kind === 'consumable' ? `c:${l.consumable_id}` : `a:${l.category_id}:${l.name}\u0001${l.brand || ''}\u0001${l.model || ''}`);

async function reserved(exceptOrderId = 0) {
  const rows = await all(`SELECT l.kind, l.consumable_id, l.category_id, l.name, l.brand, l.model, SUM(COALESCE(l.approved_qty, l.qty)) AS n
    FROM order_lines l JOIN orders o ON o.id = l.order_id WHERE o.status = 'approved' AND o.id <> ?
    GROUP BY l.kind, l.consumable_id, l.category_id, l.name, l.brand, l.model`, exceptOrderId);
  return new Map(rows.map((x) => [keyOf(x), x.n]));
}

async function catalog({ q, category_id } = {}, exceptOrderId = 0) {
  const w = []; const p = [];
  if (q) { w.push(`(x.name LIKE ? ESCAPE '\\' OR x.code LIKE ? ESCAPE '\\' OR x.brand LIKE ? ESCAPE '\\' OR x.model LIKE ? ESCAPE '\\')`); p.push(...Array(4).fill(likeTerm(q))); }
  if (category_id) { w.push('x.category_id = ?'); p.push(toInt(category_id)); }
  const rows = await all(`SELECT * FROM (
      SELECT 'consumable' AS kind, c.id AS consumable_id, c.category_id, k.name AS category_name, c.name, '' AS brand, '' AS model,
             c.sku AS code, c.unit, c.image_path, c.qty_on_hand AS on_hand
      FROM consumables c JOIN categories k ON k.id = c.category_id WHERE c.deleted_at IS NULL
      UNION ALL
      SELECT 'asset' AS kind, NULL AS consumable_id, a.category_id, k.name AS category_name, a.name, COALESCE(a.brand, '') AS brand,
             COALESCE(a.model, '') AS model, NULL AS code, 'เครื่อง' AS unit, MAX(a.image_path) AS image_path, COUNT(*) AS on_hand
      FROM assets a JOIN categories k ON k.id = a.category_id WHERE a.deleted_at IS NULL AND a.status = 'available'
      GROUP BY a.category_id, k.name, a.name, COALESCE(a.brand, ''), COALESCE(a.model, '')
    ) x ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY x.category_name, x.name`, ...p);
  const held = await reserved(exceptOrderId);
  return rows.map((x) => {
    const key = keyOf(x);
    return { ...x, key, available: Math.max(0, x.on_hand - (held.get(key) || 0)) };
  });
}

async function nextOrderNo() {
  const d = today();
  const base = `ORD-${d.slice(0, 4)}${d.slice(5, 7)}-`;
  const row = await get('SELECT order_no FROM orders WHERE order_no LIKE ? ORDER BY order_no DESC LIMIT 1', base + '%');
  return base + String(row ? parseInt(row.order_no.slice(base.length), 10) + 1 : 1).padStart(4, '0');
}

const ORDER_SELECT = `
  SELECT o.*, p.name AS person_name, dp.name AS department_name, u.full_name AS requested_by_name,
         ru.full_name AS reviewed_by_name, du.full_name AS delivered_by_name, d.doc_no,
         (SELECT COUNT(*) FROM order_lines l WHERE l.order_id = o.id) AS line_count,
         (SELECT COALESCE(SUM(COALESCE(l.approved_qty, l.qty)), 0) FROM order_lines l WHERE l.order_id = o.id) AS unit_count
  FROM orders o
  LEFT JOIN people p ON p.id = o.person_id LEFT JOIN departments dp ON dp.id = o.department_id
  LEFT JOIN users u ON u.id = o.requested_by LEFT JOIN users ru ON ru.id = o.reviewed_by
  LEFT JOIN users du ON du.id = o.delivered_by LEFT JOIN documents d ON d.id = o.doc_id`;

async function loadOrder(req, id) {
  const o = await get(`${ORDER_SELECT} WHERE o.id = ?`, toInt(id));
  if (!o || (!can(req.user, 'order.manage') && o.requested_by !== req.user.id)) throw notFound('คำสั่งเบิก');
  return o;
}

r.get('/catalog', ANY, async (req, res) => {
  res.json({ rows: await catalog(req.query) });
});

// body: { person_name, department_name, note, lines: [{ kind, consumable_id | category_id+name+brand+model, qty }] }
r.post('/', requirePerm('order.create'), async (req, res) => {
  const b = req.body || {};
  const lines = Array.isArray(b.lines) ? b.lines : [];
  if (!lines.length) throw bad('ตะกร้าว่าง — เลือกสินค้าอย่างน้อย 1 รายการ');
  if (lines.length > 100) throw bad('สั่งได้ครั้งละไม่เกิน 100 รายการ');
  const result = await tx(async () => {
    const stock = new Map((await catalog()).map((x) => [x.key, x]));
    const seen = new Set();
    const clean = lines.map((l, i) => {
      const key = keyOf({ ...l, name: String(l.name ?? '') });
      const item = stock.get(key);
      const qty = Number(l.qty);
      if (!item) throw bad(`รายการที่ ${i + 1}: ไม่พบสินค้านี้ในสต็อก — สินค้าใหม่ต้องลงทะเบียนในระบบก่อน`);
      if (seen.has(key)) throw bad(`รายการที่ ${i + 1}: ${item.name} ซ้ำในตะกร้า`);
      seen.add(key);
      if (!Number.isInteger(qty) || qty < 1) throw bad(`รายการที่ ${i + 1}: จำนวนต้องเป็นจำนวนเต็มที่มากกว่า 0`);
      if (qty > item.available) throw bad(`รายการที่ ${i + 1}: ${item.name} มีให้เบิกได้ ${item.available} ${item.unit} — ลดจำนวนลง`);
      return { ...item, qty };
    });
    const who = await resolveRecipient(req, { person_name: b.person_name || req.user.full_name, department_name: b.department_name });
    const order_no = await nextOrderNo();
    const id = Number((await run('INSERT INTO orders (order_no, person_id, department_id, note, requested_by) VALUES (?, ?, ?, ?, ?)',
      order_no, who.person_id, who.department_id, b.note, req.user.id)).lastInsertRowid);
    for (const l of clean) {
      await run(`INSERT INTO order_lines (order_id, kind, consumable_id, category_id, name, brand, model, qty) VALUES (?, ?, ?, ?, ?, COALESCE(?, ''), COALESCE(?, ''), ?)`,
        id, l.kind, l.consumable_id, l.category_id, l.name, l.brand, l.model, l.qty);
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
  const counts = Object.fromEntries((await all(`SELECT o.status, COUNT(*) n FROM orders o WHERE ${base.join(' AND ')} GROUP BY o.status`, ...baseP)).map((c) => [c.status, c.n]));
  res.json({ rows, counts });
});

r.get('/:id', ANY, async (req, res) => {
  const order = await loadOrder(req, req.params.id);
  const stock = new Map((await catalog({}, order.id)).map((x) => [x.key, x]));
  const lines = (await all(`SELECT l.*, k.name AS category_name, c.sku AS code, c.unit, c.image_path
    FROM order_lines l LEFT JOIN categories k ON k.id = l.category_id LEFT JOIN consumables c ON c.id = l.consumable_id
    WHERE l.order_id = ? ORDER BY l.id`, order.id)).map((l) => {
    const s = stock.get(keyOf(l));
    return { ...l, unit: l.unit || 'เครื่อง', image_path: l.image_path || s?.image_path || null, available: s?.available ?? 0 };
  });
  res.json({ order, lines });
});

r.post('/:id/cancel', ANY, async (req, res) => {
  await tx(async () => {
    const o = await loadOrder(req, req.params.id);
    if (o.status !== 'pending' && !(o.status === 'approved' && can(req.user, 'order.manage'))) throw bad('ยกเลิกได้เฉพาะคำสั่งเบิกที่ยังไม่ส่งมอบ');
    await run(`UPDATE orders SET status = 'cancelled', cancelled_at = ? WHERE id = ?`, now(), o.id);
    await audit(req, 'order', o.id, 'cancel', { status: o.status }, { status: 'cancelled', reason: req.body?.reason || null });
  });
  res.json({ ok: true });
});

// body: { lines: [{ id, approved_qty }], review_note } — quantities may be lowered (0 = not approved)
r.post('/:id/approve', requirePerm('order.manage'), async (req, res) => {
  await tx(async () => {
    const o = await loadOrder(req, req.params.id);
    if (o.status !== 'pending') throw bad('อนุมัติได้เฉพาะคำสั่งเบิกที่รอตรวจสอบ');
    const lines = await all('SELECT * FROM order_lines WHERE order_id = ? ORDER BY id', o.id);
    const given = new Map((Array.isArray(req.body?.lines) ? req.body.lines : []).map((l) => [toInt(l.id), l.approved_qty]));
    const stock = new Map((await catalog({}, o.id)).map((x) => [x.key, x]));
    let total = 0;
    for (const [i, l] of lines.entries()) {
      const q = given.has(l.id) ? Number(given.get(l.id)) : l.qty;
      if (!Number.isInteger(q) || q < 0 || q > l.qty) throw bad(`รายการที่ ${i + 1}: จำนวนอนุมัติต้องอยู่ระหว่าง 0–${l.qty}`);
      const avail = stock.get(keyOf(l))?.available ?? 0;
      if (q > avail) throw bad(`รายการที่ ${i + 1}: ${l.name} คงเหลือให้เบิกได้ ${avail} — ลดจำนวนอนุมัติ`);
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
    if (o.status !== 'pending') throw bad('ไม่อนุมัติได้เฉพาะคำสั่งเบิกที่รอตรวจสอบ');
    await run(`UPDATE orders SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?`, req.user.id, now(), note, o.id);
    await audit(req, 'order', o.id, 'reject', { status: 'pending' }, { status: 'rejected', review_note: note });
  });
  res.json({ ok: true });
});

// Hand over an approved order: one ISS slip; asset lines take the oldest available units.
r.post('/:id/deliver', requirePerm('order.manage'), async (req, res) => {
  const result = await tx(async () => {
    const o = await loadOrder(req, req.params.id);
    if (o.status !== 'approved') throw bad('ส่งมอบได้เฉพาะคำสั่งเบิกที่อนุมัติแล้ว');
    const docLines = [];
    for (const l of await all('SELECT * FROM order_lines WHERE order_id = ? AND approved_qty > 0 ORDER BY id', o.id)) {
      if (l.kind === 'consumable') { docLines.push({ kind: 'consumable', consumable_id: l.consumable_id, qty: l.approved_qty }); continue; }
      const units = await all(`SELECT id FROM assets WHERE deleted_at IS NULL AND status = 'available' AND category_id = ? AND name = ?
        AND COALESCE(brand, '') = COALESCE(?, '') AND COALESCE(model, '') = COALESCE(?, '') ORDER BY received_date, id LIMIT ?`, l.category_id, l.name, l.brand, l.model, l.approved_qty);
      if (units.length < l.approved_qty) throw new HttpError(400, `${l.name}: พร้อมใช้เหลือ ${units.length} เครื่อง ไม่พอส่งมอบ ${l.approved_qty} เครื่อง`);
      for (const u of units) docLines.push({ kind: 'asset', asset_id: u.id });
    }
    const doc = await createIssueDoc(req, {
      mode: 'issue', doc_date: req.body?.doc_date || today(), person_name: o.person_name, department_name: o.department_name,
      note: [`คำสั่งเบิก ${o.order_no}`, req.body?.note || o.note].filter(Boolean).join(' · '), lines: docLines,
    });
    await run(`UPDATE orders SET status = 'delivered', delivered_by = ?, delivered_at = ?, doc_id = ? WHERE id = ?`, req.user.id, now(), doc.id, o.id);
    await audit(req, 'order', o.id, 'deliver', { status: 'approved' }, { status: 'delivered', doc_no: doc.doc_no });
    return doc;
  });
  res.status(201).json(result);
});

export default r;
