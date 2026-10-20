import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { all, get, run, now, setting } from './db.js';
import { accessLog, clientIp } from './audit.js';

const COOKIE = 'af_sid';

export function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

export function passwordProblem(pw) {
  if (!pw || pw.length < 8) return 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข';
  return null;
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').filter(Boolean).map((c) => {
    const i = c.indexOf('=');
    return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
  }));
}

function setCookie(res, value, maxAgeSec) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`);
}

export function permsForRole(roleId) {
  return all('SELECT perm_key FROM role_permissions WHERE role_id = ?', roleId).map((r) => r.perm_key);
}

function loadUser(userId) {
  const u = get(
    `SELECT u.id, u.username, u.full_name, u.email, u.role_id, r.name AS role_name, r.key AS role_key
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = ? AND u.is_active = 1 AND u.deleted_at IS NULL`, userId);
  if (!u) return null;
  u.permissions = permsForRole(u.role_id);
  return u;
}

const idleMinutes = () => Number(setting('session_idle_minutes', '30'));

// Attaches req.user when the session is valid; slides the idle timeout.
export function sessionMiddleware(req, res, next) {
  const sid = parseCookies(req.headers.cookie)[COOKIE];
  if (sid) {
    const s = get(
      `SELECT * FROM sessions WHERE id = ? AND last_seen > datetime('now', ?)`,
      sid, `-${idleMinutes()} minutes`,
    );
    if (s) {
      const user = loadUser(s.user_id);
      if (user) {
        req.user = user;
        req.sessionId = sid;
        run('UPDATE sessions SET last_seen = ? WHERE id = ?', now(), sid);
        setCookie(res, sid, idleMinutes() * 60);
      }
    } else {
      run('DELETE FROM sessions WHERE id = ?', sid);
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' });
  next();
}

export const can = (user, perm) => !!user?.permissions.includes(perm);

export function requirePerm(...perms) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' });
    if (!perms.some((p) => can(req.user, p))) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ทำรายการนี้ — ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์' });
    }
    next();
  };
}

export function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });

  const u = get('SELECT * FROM users WHERE username = ? AND deleted_at IS NULL', String(username).trim());
  const generic = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';

  if (!u) {
    accessLog(req, null, username, 'login_failed');
    return res.status(401).json({ error: generic });
  }
  if (!u.is_active) {
    accessLog(req, u.id, u.username, 'login_failed');
    return res.status(403).json({ error: 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ' });
  }
  if (u.locked_until && u.locked_until > now()) {
    accessLog(req, u.id, u.username, 'login_blocked');
    const mins = Math.ceil((new Date(u.locked_until.replace(' ', 'T') + 'Z') - Date.now()) / 60000);
    return res.status(423).json({ error: `บัญชีถูกล็อกชั่วคราวเนื่องจากใส่รหัสผิดหลายครั้ง ลองใหม่ใน ${mins} นาที` });
  }

  if (!bcrypt.compareSync(password, u.password_hash)) {
    const max = Number(setting('max_failed_logins', '5'));
    const attempts = u.failed_attempts + 1;
    if (attempts >= max) {
      const until = new Date(Date.now() + Number(setting('lockout_minutes', '15')) * 60000).toISOString().replace('T', ' ').slice(0, 19);
      run('UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?', until, u.id);
      accessLog(req, u.id, u.username, 'locked');
      return res.status(423).json({ error: `ใส่รหัสผิด ${max} ครั้ง บัญชีถูกล็อก ${setting('lockout_minutes', '15')} นาที` });
    }
    run('UPDATE users SET failed_attempts = ? WHERE id = ?', attempts, u.id);
    accessLog(req, u.id, u.username, 'login_failed');
    return res.status(401).json({ error: `${generic} (เหลืออีก ${max - attempts} ครั้งก่อนบัญชีถูกล็อก)` });
  }

  run('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?', now(), u.id);
  const sid = crypto.randomBytes(32).toString('hex');
  run('INSERT INTO sessions (id, user_id, ip, user_agent) VALUES (?, ?, ?, ?)', sid, u.id, clientIp(req), (req.headers['user-agent'] || '').slice(0, 300));
  setCookie(res, sid, idleMinutes() * 60);
  accessLog(req, u.id, u.username, 'login');
  res.json({ user: loadUser(u.id) });
}

export function logout(req, res) {
  if (req.sessionId) {
    run('DELETE FROM sessions WHERE id = ?', req.sessionId);
    accessLog(req, req.user.id, req.user.username, 'logout');
  }
  setCookie(res, '', 0);
  res.json({ ok: true });
}

export function purgeExpiredSessions() {
  run(`DELETE FROM sessions WHERE last_seen < datetime('now', ?)`, `-${idleMinutes()} minutes`);
}
