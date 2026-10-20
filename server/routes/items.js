import { Router } from 'express';
import ExcelJS from 'exceljs';
import { all, get } from '../db.js';
import { requirePerm, can } from '../auth.js';
import { audit } from '../audit.js';
import { STATUS_LABEL } from '../lifecycle.js';
import { paging, likeTerm } from './util.js';
import { SELECT as ASSET_SELECT, addAssetSheet } from './assets.js';
import { SELECT as CONS_SELECT, addConsumableSheets } from './consumables.js';

// Unified register: per-item assets + quantity-tracked consumables in one list.
// The category's kind decides which one a row is.
const r = Router();

const STOCK_STATUS = ['in_stock', 'low_stock', 'out_of_stock'];

const ASSET_PART = `
  SELECT 'asset' AS kind, a.id, a.asset_tag AS code, a.name, a.category_id, c.name AS category_name, a.status,
         a.image_path, a.serial_no, a.brand, a.model, p.name AS holder_name, a.holder_section, d.name AS department_name, a.location_id, l.name AS location_name,
         a.due_date, a.warranty_expiry, a.purchase_price AS price, NULL AS qty_on_hand, NULL AS unit, NULL AS reorder_point,
         a.updated_at
  FROM assets a JOIN categories c ON c.id = a.category_id
  LEFT JOIN people p ON p.id = a.holder_person_id LEFT JOIN departments d ON d.id = a.department_id
  LEFT JOIN locations l ON l.id = a.location_id
  WHERE a.deleted_at IS NULL`;

const CONS_PART = `
  SELECT 'consumable' AS kind, x.id, x.sku AS code, x.name, x.category_id, c.name AS category_name,
         CASE WHEN x.qty_on_hand = 0 THEN 'out_of_stock' WHEN x.qty_on_hand <= x.reorder_point THEN 'low_stock' ELSE 'in_stock' END AS status,
         NULL AS image_path, NULL AS serial_no, NULL AS brand, NULL AS model, NULL AS holder_name, NULL AS holder_section, NULL AS department_name, x.location_id, l.name AS location_name,
         NULL AS due_date, NULL AS warranty_expiry, x.unit_cost AS price, x.qty_on_hand, x.unit, x.reorder_point,
         x.updated_at
  FROM consumables x JOIN categories c ON c.id = x.category_id
  LEFT JOIN locations l ON l.id = x.location_id
  WHERE x.deleted_at IS NULL`;

const SORTS = { code: 'code', name: 'name COLLATE NOCASE', status: 'status', updated_at: 'updated_at', warranty_expiry: 'warranty_expiry', price: 'price' };

function build(req) {
  const q = req.query;
  const parts = [];
  const wantAssetStatus = q.status && STATUS_LABEL[q.status];
  const wantStock = q.status && (STOCK_STATUS.includes(q.status) || q.status === 'low');
  if (can(req.user, 'asset.view') && !wantStock) parts.push(ASSET_PART);
  if (can(req.user, 'consumable.view') && !wantAssetStatus) parts.push(CONS_PART);
  if (!parts.length) return null;

  const where = ['1=1'];
  const params = [];
  if (q.q) {
    where.push(`(code LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR serial_no LIKE ? ESCAPE '\\' OR brand LIKE ? ESCAPE '\\' OR model LIKE ? ESCAPE '\\' OR holder_name LIKE ? ESCAPE '\\' OR holder_section LIKE ? ESCAPE '\\')`);
    params.push(...Array(7).fill(likeTerm(q.q)));
  }
  if (q.category_id) { where.push('category_id = ?'); params.push(q.category_id); }
  if (q.location_id) { where.push('location_id = ?'); params.push(q.location_id); }
  if (wantAssetStatus) { where.push('status = ?'); params.push(q.status); }
  else if (q.status === 'low') where.push(`status IN ('low_stock','out_of_stock')`);
  else if (wantStock) { where.push('status = ?'); params.push(q.status); }
  else where.push(`status <> 'scrapped'`);
  if (q.warranty === '1') {
    where.push(`kind = 'asset' AND warranty_expiry BETWEEN date('now','localtime') AND date('now','localtime', '+' || ? || ' days')`);
    params.push(q.days || 30);
  }
  return { from: `(${parts.join(' UNION ALL ')})`, where: where.join(' AND '), params };
}

r.get('/', requirePerm('asset.view', 'consumable.view'), (req, res) => {
  const { page, pageSize, offset } = paging(req);
  const b = build(req);
  if (!b) return res.json({ rows: [], total: 0, page, pageSize });
  const sort = SORTS[req.query.sort] || 'updated_at';
  const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  const total = get(`SELECT COUNT(*) n FROM ${b.from} WHERE ${b.where}`, ...b.params).n;
  const rows = all(`SELECT * FROM ${b.from} WHERE ${b.where} ORDER BY ${sort} ${dir}, kind, id DESC LIMIT ? OFFSET ?`, ...b.params, pageSize, offset);
  const counts = Object.fromEntries(all(`SELECT status, COUNT(*) n FROM (${[can(req.user, 'asset.view') && ASSET_PART, can(req.user, 'consumable.view') && CONS_PART].filter(Boolean).join(' UNION ALL ')}) GROUP BY status`).map((x) => [x.status, x.n]));
  res.json({ rows, total, page, pageSize, counts });
});

r.get('/export', requirePerm('report.export'), async (req, res, next) => {
  try {
    const cat = req.query.category_id ? get('SELECT kind FROM categories WHERE id = ?', req.query.category_id) : null;
    const wb = new ExcelJS.Workbook();
    let n = 0;
    if (can(req.user, 'asset.view') && (!cat || cat.kind === 'asset')) {
      const p = []; let w = 'a.deleted_at IS NULL';
      if (cat) { w += ' AND a.category_id = ?'; p.push(req.query.category_id); }
      const rows = all(`${ASSET_SELECT} WHERE ${w} ORDER BY a.asset_tag`, ...p);
      addAssetSheet(wb, rows); n += rows.length;
    }
    if (can(req.user, 'consumable.view') && (!cat || cat.kind === 'consumable')) {
      const p = []; let w = 'x.deleted_at IS NULL';
      if (cat) { w += ' AND x.category_id = ?'; p.push(req.query.category_id); }
      const rows = all(`${CONS_SELECT} WHERE ${w} ORDER BY x.sku`, ...p);
      addConsumableSheets(wb, rows); n += rows.length;
    }
    audit(req, 'item', null, 'export', null, { count: n, filter: req.query });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="items-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

export default r;
