import { Router } from 'express';
import { all, get, setting } from '../db.js';
import { requirePerm, requireAuth, can } from '../auth.js';

const r = Router();

r.get('/', requirePerm('dashboard.view'), (req, res) => {
  const days = Number(setting('warranty_alert_days', '30'));
  const counts = Object.fromEntries(all(`SELECT status, COUNT(*) n FROM assets WHERE deleted_at IS NULL GROUP BY status`).map((r) => [r.status, r.n]));
  const total = Object.entries(counts).filter(([s]) => s !== 'scrapped').reduce((a, [, n]) => a + n, 0);

  const overdue = all(`
    SELECT a.id, a.asset_tag, a.name, a.due_date, p.name holder_name, d.name department_name
    FROM assets a LEFT JOIN people p ON p.id = a.holder_person_id LEFT JOIN departments d ON d.id = a.department_id
    WHERE a.deleted_at IS NULL AND a.status = 'borrowed' AND a.due_date < date('now','localtime')
    ORDER BY a.due_date LIMIT 50`);
  const dueSoon = get(`SELECT COUNT(*) n FROM assets WHERE deleted_at IS NULL AND status='borrowed'
    AND due_date BETWEEN date('now','localtime') AND date('now','localtime','+3 days')`).n;
  const warranty = all(`
    SELECT id, asset_tag, name, warranty_expiry FROM assets
    WHERE deleted_at IS NULL AND status <> 'scrapped'
      AND warranty_expiry BETWEEN date('now','localtime') AND date('now','localtime', ?)
    ORDER BY warranty_expiry LIMIT 50`, `+${days} days`);
  const lowStock = all(`SELECT id, sku, name, qty_on_hand, reorder_point, unit FROM consumables
    WHERE deleted_at IS NULL AND qty_on_hand <= reorder_point ORDER BY (qty_on_hand * 1.0 / MAX(reorder_point,1))`);

  // Monthly spend: assets purchased + consumables received (last 6 months)
  const spend = all(`
    WITH months(m) AS (SELECT strftime('%Y-%m', date('now','localtime','start of month', '-' || n || ' months'))
                       FROM (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5))
    SELECT m AS month,
      COALESCE((SELECT SUM(purchase_price) FROM assets WHERE deleted_at IS NULL AND strftime('%Y-%m', purchase_date) = m), 0) AS assets,
      COALESCE((SELECT SUM(qty * COALESCE(unit_cost,0)) FROM stock_movements WHERE type='in' AND note <> 'ยอดยกมา' AND strftime('%Y-%m', COALESCE(received_date, created_at)) = m), 0) AS consumables
    FROM months ORDER BY m`);

  const byCategory = all(`SELECT c.name, COUNT(*) n FROM assets a JOIN categories c ON c.id = a.category_id
    WHERE a.deleted_at IS NULL AND a.status <> 'scrapped' GROUP BY c.id ORDER BY n DESC LIMIT 8`);

  const issuedThisMonth = get(`SELECT COALESCE(SUM(m.qty),0) n FROM stock_movements m LEFT JOIN documents d ON d.id = m.doc_id
    WHERE m.type='out' AND COALESCE(d.doc_date, m.created_at) >= date('now','localtime','start of month')`).n;

  res.json({ counts, total, overdue, dueSoon, warranty, warrantyDays: days, lowStock, spend, byCategory, issuedThisMonth });
});

// Merged feed of asset transactions + stock movements
r.get('/activity', requireAuth, (req, res) => {
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
  res.json({ rows: all(`SELECT * FROM (${parts.join(' UNION ALL ')}) ORDER BY created_at DESC, id DESC LIMIT ?`, limit) });
});

// Sidebar badges
r.get('/badges', requireAuth, (req, res) => {
  res.json({
    overdue: can(req.user, 'asset.view') ? get(`SELECT COUNT(*) n FROM assets WHERE deleted_at IS NULL AND status='borrowed' AND due_date < date('now','localtime')`).n : 0,
    lowStock: can(req.user, 'consumable.view') ? get('SELECT COUNT(*) n FROM consumables WHERE deleted_at IS NULL AND qty_on_hand <= reorder_point').n : 0,
  });
});

export default r;
