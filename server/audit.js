import { run } from './db.js';

export function clientIp(req) {
  return (req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '').replace('::ffff:', '');
}

const SECRET_FIELDS = ['password_hash', 'password'];
function strip(obj) {
  if (!obj) return null;
  const copy = { ...obj };
  for (const f of SECRET_FIELDS) if (f in copy) copy[f] = '***';
  return JSON.stringify(copy);
}

export function audit(req, entity, entityId, action, before, after) {
  run(
    `INSERT INTO audit_logs (user_id, username, entity, entity_id, action, before_json, after_json, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    req.user?.id, req.user?.username, entity, entityId, action, strip(before), strip(after), clientIp(req),
  );
}

export function accessLog(req, userId, username, event) {
  run(
    'INSERT INTO access_logs (user_id, username, event, ip, user_agent) VALUES (?, ?, ?, ?, ?)',
    userId, username, event, clientIp(req), (req.headers['user-agent'] || '').slice(0, 300),
  );
}
