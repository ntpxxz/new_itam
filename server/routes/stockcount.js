import { Router } from 'express';
import { all, get, run, now, tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { audit } from '../audit.js';
import { bad, notFound, toInt } from './util.js';

const r = Router();

function summary(count) {
  const scope = count.location_id ? 'AND a.location_id = ?' : '';
  const sp = count.location_id ? [count.location_id] : [];
  const expected = all(`SELECT a.id, a.asset_tag, a.name, a.status, l.name location_name, p.name holder_name
    FROM assets a LEFT JOIN locations l ON l.id = a.location_id LEFT JOIN people p ON p.id = a.holder_person_id
    WHERE a.deleted_at IS NULL AND a.status NOT IN ('scrapped') ${scope} ORDER BY a.asset_tag`, ...sp);
  const scans = all(`SELECT s.*, a.asset_tag, a.name, a.location_id, l.name location_name, u.full_name scanned_by_name
    FROM stock_count_scans s LEFT JOIN assets a ON a.id = s.asset_id LEFT JOIN locations l ON l.id = a.location_id
    LEFT JOIN users u ON u.id = s.scanned_by WHERE s.count_id = ? ORDER BY s.scanned_at DESC`, count.id);
  const scannedIds = new Set(scans.filter((s) => s.asset_id).map((s) => s.asset_id));
  const expectedIds = new Set(expected.map((e) => e.id));
  return {
    found: expected.filter((e) => scannedIds.has(e.id)),
    missing: expected.filter((e) => !scannedIds.has(e.id)),
    unexpected: scans.filter((s) => !s.asset_id || !expectedIds.has(s.asset_id)),
    scans,
    expectedCount: expected.length,
  };
}

r.get('/', requirePerm('stockcount.manage'), (req, res) => {
  const rows = all(`SELECT c.*, l.name location_name, u.full_name created_by_name,
      (SELECT COUNT(*) FROM stock_count_scans s WHERE s.count_id = c.id) scan_count
    FROM stock_counts c LEFT JOIN locations l ON l.id = c.location_id LEFT JOIN users u ON u.id = c.created_by
    ORDER BY c.id DESC`);
  res.json({ rows });
});

r.post('/', requirePerm('stockcount.manage'), (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw bad('กรุณาตั้งชื่อรอบตรวจนับ เช่น "ตรวจนับประจำปี 2026 — ชั้น 3"');
  const location_id = toInt(req.body.location_id);
  const id = tx(() => {
    const info = run('INSERT INTO stock_counts (name, location_id, created_by) VALUES (?, ?, ?)', name, location_id, req.user.id);
    audit(req, 'stock_count', Number(info.lastInsertRowid), 'create', null, { name, location_id });
    return Number(info.lastInsertRowid);
  });
  res.status(201).json({ id });
});

r.get('/:id', requirePerm('stockcount.manage'), (req, res) => {
  const count = get(`SELECT c.*, l.name location_name FROM stock_counts c LEFT JOIN locations l ON l.id = c.location_id WHERE c.id = ?`, req.params.id);
  if (!count) throw notFound('รอบตรวจนับ');
  res.json({ count, ...summary(count) });
});

r.post('/:id/scan', requirePerm('stockcount.manage'), (req, res) => {
  const count = get('SELECT * FROM stock_counts WHERE id = ?', req.params.id);
  if (!count) throw notFound('รอบตรวจนับ');
  if (count.status !== 'open') throw bad('รอบตรวจนับนี้ปิดแล้ว — สร้างรอบใหม่เพื่อสแกนต่อ');
  let code = String(req.body?.code || '').trim();
  const m = code.match(/\/a\/([^/?#]+)/);
  if (m) code = decodeURIComponent(m[1]);
  if (!code) throw bad('กรุณาสแกนหรือพิมพ์รหัสทรัพย์สิน');
  const asset = get('SELECT id, asset_tag, name, location_id FROM assets WHERE (asset_tag = ? COLLATE NOCASE OR serial_no = ?) AND deleted_at IS NULL', code, code);
  const key = asset ? asset.asset_tag : code.toUpperCase();
  if (get('SELECT 1 FROM stock_count_scans WHERE count_id = ? AND raw_code = ?', count.id, key)) {
    return res.json({ duplicate: true, asset, code: key });
  }
  run('INSERT INTO stock_count_scans (count_id, asset_id, raw_code, scanned_by) VALUES (?, ?, ?, ?)', count.id, asset?.id, key, req.user.id);
  const wrongLocation = asset && count.location_id && asset.location_id !== count.location_id;
  res.json({ ok: true, asset, code: key, unknown: !asset, wrongLocation });
});

r.post('/:id/close', requirePerm('stockcount.manage'), (req, res) => {
  const count = get('SELECT * FROM stock_counts WHERE id = ?', req.params.id);
  if (!count) throw notFound('รอบตรวจนับ');
  const s = summary(count);
  tx(() => {
    run(`UPDATE stock_counts SET status = 'closed', closed_at = ? WHERE id = ?`, now(), count.id);
    audit(req, 'stock_count', count.id, 'close', null, { found: s.found.length, missing: s.missing.length, unexpected: s.unexpected.length });
  });
  res.json({ ok: true });
});

export default r;
