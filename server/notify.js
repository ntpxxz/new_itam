import { run } from './db.js';

// One in-app notification for one user. Nobody is notified about their own action.
export async function notify(req, userId, { kind, title, body = null, link = null }) {
  if (!userId || userId === req.user?.id) return;
  await run('INSERT INTO notifications (user_id, kind, title, body, link) VALUES (?, ?, ?, ?, ?)', userId, kind, title, body, link);
}
