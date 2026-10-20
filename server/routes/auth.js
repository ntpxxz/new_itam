import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { get, run, now } from '../db.js';
import { login, logout, requireAuth, passwordProblem, hashPassword } from '../auth.js';
import { audit } from '../audit.js';

const r = Router();

r.post('/login', login);
r.post('/logout', logout);
r.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

r.post('/change-password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  const u = get('SELECT password_hash FROM users WHERE id = ?', req.user.id);
  if (!bcrypt.compareSync(current || '', u.password_hash)) return res.status(400).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
  const problem = passwordProblem(next);
  if (problem) return res.status(400).json({ error: problem });
  run('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?', hashPassword(next), now(), req.user.id);
  run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', req.user.id, req.sessionId);
  audit(req, 'user', req.user.id, 'change_password', null, null);
  res.json({ ok: true });
});

export default r;
