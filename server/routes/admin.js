import { Router } from 'express';
import { all, get, run, now, tx, setting } from '../db.js';
import { requirePerm, hashPassword, passwordProblem } from '../auth.js';
import { audit } from '../audit.js';
import { bad, notFound, paging, likeTerm, toInt } from './util.js';
import { DEFAULT_SETTINGS, PERMISSIONS } from '../permissions.js';

const r = Router();

/* ---------- users ---------- */
const USER_COLS = `u.id, u.username, u.full_name, u.role_id, r.name AS role_name, u.is_active,
  u.locked_until, u.last_login_at, u.created_at`;

r.get('/users', requirePerm('user.manage'), async (req, res) => {
  res.json({ rows: await all(`SELECT ${USER_COLS} FROM users u JOIN roles r ON r.id = u.role_id WHERE u.deleted_at IS NULL ORDER BY u.username`) });
});

r.post('/users', requirePerm('user.manage'), async (req, res) => {
  const { username, full_name, role_id, password } = req.body || {};
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username || '')) throw bad('ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ/ตัวเลข 3–32 ตัว (ใช้ . _ - ได้)');
  if (!full_name?.trim()) throw bad('กรุณากรอกชื่อ-นามสกุล');
  if (!(await get('SELECT 1 AS x FROM roles WHERE id = ?', toInt(role_id)))) throw bad('กรุณาเลือกบทบาท');
  const problem = passwordProblem(password);
  if (problem) throw bad(problem);
  if (await get('SELECT 1 AS x FROM users WHERE username = ?', username)) throw bad('ชื่อผู้ใช้นี้ถูกใช้แล้ว');
  const id = await tx(async () => {
    const info = await run('INSERT INTO users (username, password_hash, full_name, role_id, password_changed_at) VALUES (?, ?, ?, ?, ?)',
      username, hashPassword(password), full_name.trim(), toInt(role_id), now());
    const row = await get('SELECT * FROM users WHERE id = ?', info.lastInsertRowid);
    await audit(req, 'user', row.id, 'create', null, row);
    return row.id;
  });
  res.status(201).json(await get(`SELECT ${USER_COLS} FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`, id));
});

r.put('/users/:id', requirePerm('user.manage'), async (req, res) => {
  const before = await get('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', toInt(req.params.id));
  if (!before) throw notFound('ผู้ใช้');
  const { full_name, role_id, is_active, password, unlock } = req.body || {};
  const isSelf = before.id === req.user.id;
  if (isSelf && (is_active === false || is_active === 0)) throw bad('ปิดใช้งานบัญชีของตัวเองไม่ได้');
  if (isSelf && role_id && Number(role_id) !== before.role_id) throw bad('เปลี่ยนบทบาทของตัวเองไม่ได้ — ให้ Admin คนอื่นเปลี่ยนให้');
  if (role_id && !(await get('SELECT 1 AS x FROM roles WHERE id = ?', toInt(role_id)))) throw bad('บทบาทไม่ถูกต้อง');
  await tx(async () => {
    await run('UPDATE users SET full_name = ?, role_id = ?, is_active = ? WHERE id = ?',
      full_name?.trim() || before.full_name, toInt(role_id) || before.role_id,
      is_active === undefined ? before.is_active : (is_active ? 1 : 0), before.id);
    if (password) {
      const problem = passwordProblem(password);
      if (problem) throw bad(problem);
      await run('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?', hashPassword(password), now(), before.id);
      await run('DELETE FROM sessions WHERE user_id = ?', before.id);
    }
    if (unlock) await run('UPDATE users SET locked_until = NULL, failed_attempts = 0 WHERE id = ?', before.id);
    if (is_active === false || is_active === 0) await run('DELETE FROM sessions WHERE user_id = ?', before.id);
    await audit(req, 'user', before.id, password ? 'reset_password' : unlock ? 'unlock' : 'update', before, await get('SELECT * FROM users WHERE id = ?', before.id));
  });
  res.json(await get(`SELECT ${USER_COLS} FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`, before.id));
});

r.delete('/users/:id', requirePerm('user.manage'), async (req, res) => {
  const before = await get('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', toInt(req.params.id));
  if (!before) throw notFound('ผู้ใช้');
  if (before.id === req.user.id) throw bad('ลบบัญชีของตัวเองไม่ได้');
  await tx(async () => {
    await run('UPDATE users SET deleted_at = ?, is_active = 0 WHERE id = ?', now(), before.id);
    await run('DELETE FROM sessions WHERE user_id = ?', before.id);
    await audit(req, 'user', before.id, 'delete', before, null);
  });
  res.json({ ok: true });
});

/* ---------- roles & permissions ---------- */
const PERM_ORDER = new Map(PERMISSIONS.map(([key], i) => [key, i]));

r.get('/roles', requirePerm('role.manage', 'user.manage'), async (req, res) => {
  const roles = await all(`SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id AND u.deleted_at IS NULL) AS user_count FROM roles r ORDER BY r.id`);
  for (const role of roles) role.permissions = (await all('SELECT perm_key FROM role_permissions WHERE role_id = ?', role.id)).map((x) => x.perm_key);
  const permissions = (await all('SELECT * FROM permissions'))
    .sort((a, b) => (PERM_ORDER.get(a.key) ?? 999) - (PERM_ORDER.get(b.key) ?? 999));
  res.json({ roles, permissions });
});

async function savePerms(roleId, perms) {
  const valid = new Set((await all('SELECT "key" FROM permissions')).map((p) => p.key));
  await run('DELETE FROM role_permissions WHERE role_id = ?', roleId);
  for (const p of perms || []) if (valid.has(p)) await run('INSERT INTO role_permissions (role_id, perm_key) VALUES (?, ?)', roleId, p);
}

r.post('/roles', requirePerm('role.manage'), async (req, res) => {
  const { name, description, permissions } = req.body || {};
  if (!name?.trim()) throw bad('กรุณากรอกชื่อบทบาท');
  const id = await tx(async () => {
    const key = 'custom_' + Date.now().toString(36);
    const info = await run('INSERT INTO roles ("key", name, description) VALUES (?, ?, ?)', key, name.trim(), description);
    await savePerms(info.lastInsertRowid, permissions);
    await audit(req, 'role', Number(info.lastInsertRowid), 'create', null, { name, permissions });
    return info.lastInsertRowid;
  });
  res.status(201).json({ id });
});

r.put('/roles/:id', requirePerm('role.manage'), async (req, res) => {
  const role = await get('SELECT * FROM roles WHERE id = ?', toInt(req.params.id));
  if (!role) throw notFound('บทบาท');
  const { name, description, permissions } = req.body || {};
  if (role.key === 'admin' && permissions && !['role.manage', 'user.manage'].every((p) => permissions.includes(p))) {
    throw bad('บทบาท Admin ต้องมีสิทธิ์จัดการผู้ใช้และบทบาทเสมอ เพื่อไม่ให้ระบบไม่มีผู้ดูแล');
  }
  const beforePerms = (await all('SELECT perm_key FROM role_permissions WHERE role_id = ?', role.id)).map((x) => x.perm_key);
  await tx(async () => {
    await run('UPDATE roles SET name = ?, description = ? WHERE id = ?', name?.trim() || role.name, description ?? role.description, role.id);
    if (permissions) await savePerms(role.id, permissions);
    await audit(req, 'role', role.id, 'update', { ...role, permissions: beforePerms }, { name, description, permissions });
  });
  res.json({ ok: true });
});

r.delete('/roles/:id', requirePerm('role.manage'), async (req, res) => {
  const role = await get('SELECT * FROM roles WHERE id = ?', toInt(req.params.id));
  if (!role) throw notFound('บทบาท');
  if (role.is_system) throw bad('บทบาทพื้นฐานของระบบลบไม่ได้');
  const n = (await get('SELECT COUNT(*) n FROM users WHERE role_id = ? AND deleted_at IS NULL', role.id)).n;
  if (n) throw bad(`ลบไม่ได้ เพราะมีผู้ใช้ ${n} คนใช้บทบาทนี้อยู่ — ย้ายผู้ใช้ไปบทบาทอื่นก่อน`);
  await tx(async () => {
    await run('DELETE FROM role_permissions WHERE role_id = ?', role.id);
    await run('DELETE FROM roles WHERE id = ?', role.id);
    await audit(req, 'role', role.id, 'delete', role, null);
  });
  res.json({ ok: true });
});

/* ---------- logs ---------- */
r.get('/logs/access', requirePerm('log.view'), async (req, res) => {
  const { page, pageSize, offset } = paging(req, 50);
  const w = ['1=1']; const p = [];
  if (req.query.event) { w.push('event = ?'); p.push(req.query.event); }
  if (req.query.q) { w.push(`(username LIKE ? ESCAPE '\\' OR ip LIKE ? ESCAPE '\\')`); p.push(likeTerm(req.query.q), likeTerm(req.query.q)); }
  const total = (await get(`SELECT COUNT(*) n FROM access_logs WHERE ${w.join(' AND ')}`, ...p)).n;
  const rows = await all(`SELECT * FROM access_logs WHERE ${w.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`, ...p, pageSize, offset);
  res.json({ rows, total, page, pageSize });
});

r.get('/logs/audit', requirePerm('log.view'), async (req, res) => {
  const { page, pageSize, offset } = paging(req, 50);
  const w = ['1=1']; const p = [];
  if (req.query.entity) { w.push('entity = ?'); p.push(req.query.entity); }
  if (req.query.entity_id) { w.push('entity_id = ?'); p.push(toInt(req.query.entity_id)); }
  if (req.query.q) { w.push(`(username LIKE ? ESCAPE '\\' OR action LIKE ? ESCAPE '\\')`); p.push(likeTerm(req.query.q), likeTerm(req.query.q)); }
  const total = (await get(`SELECT COUNT(*) n FROM audit_logs WHERE ${w.join(' AND ')}`, ...p)).n;
  const rows = await all(`SELECT * FROM audit_logs WHERE ${w.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`, ...p, pageSize, offset);
  res.json({ rows, total, page, pageSize });
});

/* ---------- settings ---------- */
r.get('/settings', requirePerm('settings.manage'), async (req, res) => {
  const entries = [];
  for (const k of Object.keys(DEFAULT_SETTINGS)) entries.push([k, await setting(k, DEFAULT_SETTINGS[k])]);
  res.json(Object.fromEntries(entries));
});

r.put('/settings', requirePerm('settings.manage'), async (req, res) => {
  const body = req.body || {};
  const numeric = { max_failed_logins: [3, 20], lockout_minutes: [1, 1440], session_idle_minutes: [5, 480], log_retention_days: [90, 3650], warranty_alert_days: [1, 365] };
  const before = {};
  await tx(async () => {
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (body[k] === undefined) continue;
      const v = String(body[k]).trim();
      if (numeric[k]) {
        const n = Number(v);
        if (!Number.isInteger(n) || n < numeric[k][0] || n > numeric[k][1]) throw bad(`ค่า ${k} ต้องอยู่ระหว่าง ${numeric[k][0]}–${numeric[k][1]}`);
      }
      before[k] = await setting(k);
      if (v === '') await run('DELETE FROM settings WHERE "key" = ?', k);
      else if (!(await run('UPDATE settings SET value = ? WHERE "key" = ?', v, k)).changes) {
        await run('INSERT INTO settings ("key", value) VALUES (?, ?)', k, v);
      }
    }
    await audit(req, 'settings', null, 'update', before, body);
  });
  res.json({ ok: true });
});

export default r;
