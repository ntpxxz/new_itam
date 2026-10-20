import { Router } from 'express';
import { all, get, run, now, tx, setting } from '../db.js';
import { requirePerm, hashPassword, passwordProblem } from '../auth.js';
import { audit } from '../audit.js';
import { bad, notFound, paging, likeTerm } from './util.js';
import { DEFAULT_SETTINGS } from '../permissions.js';

const r = Router();

/* ---------- users ---------- */
const USER_COLS = `u.id, u.username, u.full_name, u.email, u.role_id, r.name AS role_name, u.is_active,
  u.locked_until, u.last_login_at, u.created_at`;

r.get('/users', requirePerm('user.manage'), (req, res) => {
  res.json({ rows: all(`SELECT ${USER_COLS} FROM users u JOIN roles r ON r.id = u.role_id WHERE u.deleted_at IS NULL ORDER BY u.username`) });
});

r.post('/users', requirePerm('user.manage'), (req, res) => {
  const { username, full_name, email, role_id, password } = req.body || {};
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username || '')) throw bad('ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ/ตัวเลข 3–32 ตัว (ใช้ . _ - ได้)');
  if (!full_name?.trim()) throw bad('กรุณากรอกชื่อ-นามสกุล');
  if (!get('SELECT 1 FROM roles WHERE id = ?', role_id)) throw bad('กรุณาเลือกบทบาท');
  const problem = passwordProblem(password);
  if (problem) throw bad(problem);
  if (get('SELECT 1 FROM users WHERE username = ?', username)) throw bad('ชื่อผู้ใช้นี้ถูกใช้แล้ว');
  const id = tx(() => {
    const info = run('INSERT INTO users (username, password_hash, full_name, email, role_id, password_changed_at) VALUES (?, ?, ?, ?, ?, ?)',
      username, hashPassword(password), full_name.trim(), email, role_id, now());
    const row = get('SELECT * FROM users WHERE id = ?', info.lastInsertRowid);
    audit(req, 'user', row.id, 'create', null, row);
    return row.id;
  });
  res.status(201).json(get(`SELECT ${USER_COLS} FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`, id));
});

r.put('/users/:id', requirePerm('user.manage'), (req, res) => {
  const before = get('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', req.params.id);
  if (!before) throw notFound('ผู้ใช้');
  const { full_name, email, role_id, is_active, password, unlock } = req.body || {};
  const isSelf = before.id === req.user.id;
  if (isSelf && (is_active === false || is_active === 0)) throw bad('ปิดใช้งานบัญชีของตัวเองไม่ได้');
  if (isSelf && role_id && Number(role_id) !== before.role_id) throw bad('เปลี่ยนบทบาทของตัวเองไม่ได้ — ให้ Admin คนอื่นเปลี่ยนให้');
  if (role_id && !get('SELECT 1 FROM roles WHERE id = ?', role_id)) throw bad('บทบาทไม่ถูกต้อง');
  tx(() => {
    run('UPDATE users SET full_name = ?, email = ?, role_id = ?, is_active = ? WHERE id = ?',
      full_name?.trim() || before.full_name, email ?? before.email, role_id || before.role_id,
      is_active === undefined ? before.is_active : (is_active ? 1 : 0), before.id);
    if (password) {
      const problem = passwordProblem(password);
      if (problem) throw bad(problem);
      run('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?', hashPassword(password), now(), before.id);
      run('DELETE FROM sessions WHERE user_id = ?', before.id);
    }
    if (unlock) run('UPDATE users SET locked_until = NULL, failed_attempts = 0 WHERE id = ?', before.id);
    if (is_active === false || is_active === 0) run('DELETE FROM sessions WHERE user_id = ?', before.id);
    audit(req, 'user', before.id, password ? 'reset_password' : unlock ? 'unlock' : 'update', before, get('SELECT * FROM users WHERE id = ?', before.id));
  });
  res.json(get(`SELECT ${USER_COLS} FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`, before.id));
});

r.delete('/users/:id', requirePerm('user.manage'), (req, res) => {
  const before = get('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', req.params.id);
  if (!before) throw notFound('ผู้ใช้');
  if (before.id === req.user.id) throw bad('ลบบัญชีของตัวเองไม่ได้');
  tx(() => {
    run('UPDATE users SET deleted_at = ?, is_active = 0 WHERE id = ?', now(), before.id);
    run('DELETE FROM sessions WHERE user_id = ?', before.id);
    audit(req, 'user', before.id, 'delete', before, null);
  });
  res.json({ ok: true });
});

/* ---------- roles & permissions ---------- */
r.get('/roles', requirePerm('role.manage', 'user.manage'), (req, res) => {
  const roles = all(`SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id AND u.deleted_at IS NULL) AS user_count FROM roles r ORDER BY r.id`);
  for (const role of roles) role.permissions = all('SELECT perm_key FROM role_permissions WHERE role_id = ?', role.id).map((x) => x.perm_key);
  res.json({ roles, permissions: all('SELECT * FROM permissions ORDER BY rowid') });
});

function savePerms(roleId, perms) {
  const valid = new Set(all('SELECT key FROM permissions').map((p) => p.key));
  run('DELETE FROM role_permissions WHERE role_id = ?', roleId);
  for (const p of perms || []) if (valid.has(p)) run('INSERT INTO role_permissions (role_id, perm_key) VALUES (?, ?)', roleId, p);
}

r.post('/roles', requirePerm('role.manage'), (req, res) => {
  const { name, description, permissions } = req.body || {};
  if (!name?.trim()) throw bad('กรุณากรอกชื่อบทบาท');
  const id = tx(() => {
    const key = 'custom_' + Date.now().toString(36);
    const info = run('INSERT INTO roles (key, name, description) VALUES (?, ?, ?)', key, name.trim(), description);
    savePerms(info.lastInsertRowid, permissions);
    audit(req, 'role', Number(info.lastInsertRowid), 'create', null, { name, permissions });
    return info.lastInsertRowid;
  });
  res.status(201).json({ id });
});

r.put('/roles/:id', requirePerm('role.manage'), (req, res) => {
  const role = get('SELECT * FROM roles WHERE id = ?', req.params.id);
  if (!role) throw notFound('บทบาท');
  const { name, description, permissions } = req.body || {};
  if (role.key === 'admin' && permissions && !['role.manage', 'user.manage'].every((p) => permissions.includes(p))) {
    throw bad('บทบาท Admin ต้องมีสิทธิ์จัดการผู้ใช้และบทบาทเสมอ เพื่อไม่ให้ระบบไม่มีผู้ดูแล');
  }
  const beforePerms = all('SELECT perm_key FROM role_permissions WHERE role_id = ?', role.id).map((x) => x.perm_key);
  tx(() => {
    run('UPDATE roles SET name = ?, description = ? WHERE id = ?', name?.trim() || role.name, description ?? role.description, role.id);
    if (permissions) savePerms(role.id, permissions);
    audit(req, 'role', role.id, 'update', { ...role, permissions: beforePerms }, { name, description, permissions });
  });
  res.json({ ok: true });
});

r.delete('/roles/:id', requirePerm('role.manage'), (req, res) => {
  const role = get('SELECT * FROM roles WHERE id = ?', req.params.id);
  if (!role) throw notFound('บทบาท');
  if (role.is_system) throw bad('บทบาทพื้นฐานของระบบลบไม่ได้');
  const n = get('SELECT COUNT(*) n FROM users WHERE role_id = ? AND deleted_at IS NULL', role.id).n;
  if (n) throw bad(`ลบไม่ได้ เพราะมีผู้ใช้ ${n} คนใช้บทบาทนี้อยู่ — ย้ายผู้ใช้ไปบทบาทอื่นก่อน`);
  tx(() => {
    run('DELETE FROM role_permissions WHERE role_id = ?', role.id);
    run('DELETE FROM roles WHERE id = ?', role.id);
    audit(req, 'role', role.id, 'delete', role, null);
  });
  res.json({ ok: true });
});

/* ---------- logs ---------- */
r.get('/logs/access', requirePerm('log.view'), (req, res) => {
  const { page, pageSize, offset } = paging(req, 50);
  const w = ['1=1']; const p = [];
  if (req.query.event) { w.push('event = ?'); p.push(req.query.event); }
  if (req.query.q) { w.push(`(username LIKE ? ESCAPE '\\' OR ip LIKE ? ESCAPE '\\')`); p.push(likeTerm(req.query.q), likeTerm(req.query.q)); }
  const total = get(`SELECT COUNT(*) n FROM access_logs WHERE ${w.join(' AND ')}`, ...p).n;
  const rows = all(`SELECT * FROM access_logs WHERE ${w.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`, ...p, pageSize, offset);
  res.json({ rows, total, page, pageSize });
});

r.get('/logs/audit', requirePerm('log.view'), (req, res) => {
  const { page, pageSize, offset } = paging(req, 50);
  const w = ['1=1']; const p = [];
  if (req.query.entity) { w.push('entity = ?'); p.push(req.query.entity); }
  if (req.query.entity_id) { w.push('entity_id = ?'); p.push(req.query.entity_id); }
  if (req.query.q) { w.push(`(username LIKE ? ESCAPE '\\' OR action LIKE ? ESCAPE '\\')`); p.push(likeTerm(req.query.q), likeTerm(req.query.q)); }
  const total = get(`SELECT COUNT(*) n FROM audit_logs WHERE ${w.join(' AND ')}`, ...p).n;
  const rows = all(`SELECT * FROM audit_logs WHERE ${w.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`, ...p, pageSize, offset);
  res.json({ rows, total, page, pageSize });
});

/* ---------- settings ---------- */
r.get('/settings', requirePerm('settings.manage'), (req, res) => {
  res.json(Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, setting(k, DEFAULT_SETTINGS[k])])));
});

r.put('/settings', requirePerm('settings.manage'), (req, res) => {
  const body = req.body || {};
  const numeric = { max_failed_logins: [3, 20], lockout_minutes: [1, 1440], session_idle_minutes: [5, 480], log_retention_days: [90, 3650], warranty_alert_days: [1, 365] };
  const before = {};
  tx(() => {
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (body[k] === undefined) continue;
      const v = String(body[k]).trim();
      if (numeric[k]) {
        const n = Number(v);
        if (!Number.isInteger(n) || n < numeric[k][0] || n > numeric[k][1]) throw bad(`ค่า ${k} ต้องอยู่ระหว่าง ${numeric[k][0]}–${numeric[k][1]}`);
      }
      before[k] = setting(k);
      run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, v);
    }
    audit(req, 'settings', null, 'update', before, body);
  });
  res.json({ ok: true });
});

export default r;
