import { Router } from 'express';
import { all, get, run, now } from '../db.js';
import { requireAuth } from '../auth.js';
import { toInt } from './util.js';

// The signed-in user's own notifications (topbar bell).
const r = Router();

r.get('/', requireAuth, async (req, res) => {
  const rows = await all('SELECT id, kind, title, body, link, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 20', req.user.id);
  const unread = (await get('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL', req.user.id)).n;
  res.json({ rows, unread });
});

r.post('/read-all', requireAuth, async (req, res) => {
  await run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now(), req.user.id);
  res.json({ ok: true });
});

r.post('/:id/read', requireAuth, async (req, res) => {
  await run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', now(), toInt(req.params.id), req.user.id);
  res.json({ ok: true });
});

export default r;
