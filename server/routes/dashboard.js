import { Router } from 'express';
import { all, get, setting, ym } from '../db.js';
import { requirePerm, requireAuth, can } from '../auth.js';
import { today, addDays, monthStart } from './util.js';

const r = Router();

r.get('/', requirePerm('dashboard.view'), async (req, res) => {
  const days = Number(await setting('warranty_alert_days', '30'));
  const d0 = today();
  const counts = Object.fromEntries((await all(`SELECT status, COUNT(*) n FROM assets WHERE deleted_at IS NULL GROUP BY status`)).map((r) => [r.status, r.n]));
  const total = Object.entries(counts).filter(([s]) => s !== 'scrapped').reduce((a, [, n]) => a + n, 0);

  const overdue = await all(`
    SELECT a.id, a.asset_tag, a.name, a.due_date, p.name holder_name, d.name department_name
    FROM assets a LEFT JOIN people p ON p.id = a.holder_person_id LEFT JOIN departments d ON d.id = a.department_id
    WHERE a.deleted_at IS NULL AND a.status = 'borrowed' AND a.due_date < ?
    ORDER BY a.due_date LIMIT 50`, d0);
  const dueSoon = (await get(`SELECT COUNT(*) n FROM assets WHERE deleted_at IS NULL AND status='borrowed'
    AND due_date BETWEEN ? AND ?`, d0, addDays(d0, 3))).n;
  const warranty = await all(`
    SELECT id, asset_tag, name, warranty_expiry FROM assets
    WHERE deleted_at IS NULL AND status <> 'scrapped'
      AND warranty_expiry BETWEEN ? AND ?
    ORDER BY warranty_expiry LIMIT 50`, d0, addDays(d0, days));
  const lowStock = await all(`SELECT id, sku, name, qty_on_hand, reorder_point, unit FROM consumables
    WHERE deleted_at IS NULL AND qty_on_hand <= reorder_point
    ORDER BY qty_on_hand * 1.0 / CASE WHEN reorder_point > 1 THEN reorder_point ELSE 1 END`);

  // Monthly spend: assets purchased + consumables received (last 6 months)
  const from = monthStart(d0, 5);
  const months = [5, 4, 3, 2, 1, 0].map((n) => monthStart(d0, n).slice(0, 7));
  const byMonth = async (sql) => new Map((await all(sql, from)).map((x) => [x.m, Number(x.v) || 0]));
  const assetSpend = await byMonth(`SELECT ${ym('purchase_date')} m, SUM(purchase_price) v FROM assets
    WHERE deleted_at IS NULL AND purchase_date >= ? GROUP BY ${ym('purchase_date')}`);
  const consSpend = await byMonth(`SELECT ${ym('COALESCE(received_date, created_at)')} m, SUM(qty * COALESCE(unit_cost,0)) v FROM stock_movements
    WHERE type='in' AND note <> 'ยอดยกมา' AND COALESCE(received_date, created_at) >= ? GROUP BY ${ym('COALESCE(received_date, created_at)')}`);
  const spend = months.map((m) => ({ month: m, assets: assetSpend.get(m) || 0, consumables: consSpend.get(m) || 0 }));

  const byCategory = await all(`SELECT c.name, COUNT(*) n FROM assets a JOIN categories c ON c.id = a.category_id
    WHERE a.deleted_at IS NULL AND a.status <> 'scrapped' GROUP BY c.id, c.name ORDER BY n DESC LIMIT 8`);

  const issuedThisMonth = (await get(`SELECT COALESCE(SUM(m.qty),0) n FROM stock_movements m LEFT JOIN documents d ON d.id = m.doc_id
    WHERE m.type='out' AND COALESCE(d.doc_date, m.created_at) >= ?`, monthStart(d0))).n;

  res.json({ counts, total, overdue, dueSoon, warranty, warrantyDays: days, lowStock, spend, byCategory, issuedThisMonth });
});

// Merged feed of asset transactions + stock movements
r.get('/activity', requireAuth, async (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
  const parts = [];
  if (can(req.user, 'asset.view')) {
    parts.push(`SELECT 'asset' kind, t.id, t.created_at, t.action, t.note, t.asset_id ref_id, a.asset_tag code, a.name item_name,
        p.name person_name, u.full_name by_name, NULL qty, NULL unit
      FROM asset_transactions t JOIN assets a ON a.id = t.asset_id LEFT JOIN people p ON p.id = t.person_id LEFT JOIN users u ON u.id = t.performed_by`);
  }
  if (can(req.user, 'consumable.view')) {
    parts.push(`SELECT 'stock' kind, m.id, m.created_at, m.type action, m.note, m.consumable_id ref_id, x.sku code, x.name item_name,
        p.name person_name, u.full_name by_name, m.qty, x.unit
      FROM stock_movements m JOIN consumables x ON x.id = m.consumable_id LEFT JOIN people p ON p.id = m.person_id LEFT JOIN users u ON u.id = m.performed_by`);
  }
  if (!parts.length) return res.json({ rows: [] });
  res.json({ rows: await all(`SELECT * FROM (${parts.join(' UNION ALL ')}) f ORDER BY created_at DESC, id DESC LIMIT ?`, limit) });
});

// Sidebar badges
r.get('/badges', requireAuth, async (req, res) => {
  res.json({
    overdue: can(req.user, 'asset.view') ? (await get(`SELECT COUNT(*) n FROM assets WHERE deleted_at IS NULL AND status='borrowed' AND due_date < ?`, today())).n : 0,
    lowStock: can(req.user, 'consumable.view') ? (await get('SELECT COUNT(*) n FROM consumables WHERE deleted_at IS NULL AND qty_on_hand <= reorder_point')).n : 0,
    pendingReceive: can(req.user, 'consumable.view') ? (await get(`SELECT COUNT(*) n FROM pending_receipts WHERE status = 'pending' AND deleted_at IS NULL`)).n : 0,
    // Admins: orders to review or hand over. Requesters: their own approved orders waiting for pickup.
    pendingOrders: can(req.user, 'order.manage')
      ? (await get(`SELECT COUNT(*) n FROM orders WHERE status IN ('pending', 'approved')`)).n
      : can(req.user, 'order.create') ? (await get(`SELECT COUNT(*) n FROM orders WHERE status = 'approved' AND requested_by = ?`, req.user.id)).n : 0,
  });
});

export default r;
