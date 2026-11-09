import { Router } from 'express';
import { all } from '../db.js';
import { requireAuth, can } from '../auth.js';
import { likeTerm } from './util.js';

// Topbar search: a few matches per kind of record, only the kinds this user may open.
const r = Router();
const PER_GROUP = 5;
const LIKE = `LIKE ? ESCAPE '\\'`;

r.get('/', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ groups: [] });
  const t = likeTerm(q);
  const u = req.user;
  const groups = [];

  if (can(u, 'asset.view')) {
    const rows = await all(`SELECT a.id, a.asset_tag, a.name, a.serial_no, a.status, p.name AS holder_name
      FROM assets a LEFT JOIN people p ON p.id = a.holder_person_id
      WHERE a.deleted_at IS NULL AND (a.asset_tag ${LIKE} OR a.name ${LIKE} OR a.serial_no ${LIKE} OR p.name ${LIKE})
      ORDER BY a.id DESC LIMIT ?`, t, t, t, t, PER_GROUP);
    groups.push({ key: 'assets', label: 'อุปกรณ์รายชิ้น', rows: rows.map((a) => ({
      to: `/assets/${a.id}`, code: a.asset_tag, title: a.name, sub: [a.serial_no && `SN ${a.serial_no}`, a.holder_name].filter(Boolean).join(' · '), status: a.status,
    })) });
  }
  if (can(u, 'consumable.view')) {
    const rows = await all(`SELECT id, sku, name, qty_on_hand, unit FROM consumables
      WHERE deleted_at IS NULL AND (sku ${LIKE} OR name ${LIKE}) ORDER BY name LIMIT ?`, t, t, PER_GROUP);
    groups.push({ key: 'consumables', label: 'วัสดุสิ้นเปลือง', rows: rows.map((c) => ({
      to: `/consumables/${c.id}`, code: c.sku, title: c.name, sub: `คงเหลือ ${c.qty_on_hand} ${c.unit || ''}`.trim(),
    })) });
  }
  if (can(u, 'asset.view') || can(u, 'consumable.view')) {
    const rows = await all(`SELECT d.id, d.doc_no, d.type, d.doc_date, p.name AS person_name, dp.name AS department_name
      FROM documents d LEFT JOIN people p ON p.id = d.person_id LEFT JOIN departments dp ON dp.id = d.department_id
      WHERE d.doc_no ${LIKE} OR d.po_number ${LIKE} OR d.invoice_number ${LIKE}
      ORDER BY d.id DESC LIMIT ?`, t, t, t, PER_GROUP);
    groups.push({ key: 'documents', label: 'ใบรับเข้า / ใบเบิก', rows: rows.map((d) => ({
      to: `/documents/${d.id}`, code: d.doc_no, title: d.type === 'receive' ? 'ใบรับเข้า' : 'ใบเบิก', sub: [d.doc_date, d.person_name || d.department_name].filter(Boolean).join(' · '),
    })) });
  }
  if (can(u, 'order.create') || can(u, 'order.manage')) {
    const mine = !can(u, 'order.manage');
    const rows = await all(`SELECT o.id, o.order_no, o.status, p.name AS person_name, dp.name AS department_name
      FROM orders o LEFT JOIN people p ON p.id = o.person_id LEFT JOIN departments dp ON dp.id = o.department_id
      WHERE (o.order_no ${LIKE} OR p.name ${LIKE})${mine ? ' AND o.requested_by = ?' : ''}
      ORDER BY o.id DESC LIMIT ?`, t, t, ...(mine ? [u.id] : []), PER_GROUP);
    groups.push({ key: 'orders', label: 'รายการสั่งซื้อ', rows: rows.map((o) => ({
      to: `/orders/${o.id}`, code: o.order_no, title: o.person_name || o.department_name || 'รายการสั่งซื้อ', order_status: o.status,
    })) });
  }
  if (can(u, 'order.manage')) {
    const rows = await all(`SELECT po.id, po.po_no, po.doc_date, v.name AS vendor_name
      FROM purchase_orders po LEFT JOIN vendors v ON v.id = po.vendor_id
      WHERE po.po_no ${LIKE} OR v.name ${LIKE} ORDER BY po.id DESC LIMIT ?`, t, t, PER_GROUP);
    groups.push({ key: 'purchase_orders', label: 'ใบสั่งซื้อ (PO)', rows: rows.map((po) => ({
      to: `/purchase-orders/${po.id}`, code: po.po_no, title: po.vendor_name || 'ใบสั่งซื้อ', sub: po.doc_date,
    })) });
  }
  if (can(u, 'people.view') && can(u, 'asset.view')) {
    const rows = await all(`SELECT p.id, p.name, d.name AS department_name FROM people p LEFT JOIN departments d ON d.id = p.department_id
      WHERE p.deleted_at IS NULL AND p.name ${LIKE} ORDER BY p.name LIMIT ?`, t, PER_GROUP);
    groups.push({ key: 'people', label: 'พนักงาน', rows: rows.map((p) => ({
      to: `/assets?q=${encodeURIComponent(p.name)}`, title: p.name, sub: [p.department_name, 'ดูอุปกรณ์ที่ถือครอง'].filter(Boolean).join(' · '),
    })) });
  }

  res.json({ groups: groups.filter((g) => g.rows.length) });
});

export default r;
