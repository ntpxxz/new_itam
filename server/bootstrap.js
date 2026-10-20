import { all, get, run, tx, now } from './db.js';
import { PERMISSIONS, DEFAULT_ROLES, DEFAULT_SETTINGS } from './permissions.js';
import { hashPassword } from './auth.js';

// Idempotent: makes sure permissions, system roles and settings exist. Safe on every boot.
export function bootstrap() {
  tx(() => {
    const known = new Set(all('SELECT key FROM permissions').map((p) => p.key));
    const added = PERMISSIONS.map((p) => p[0]).filter((k) => !known.has(k));
    for (const [key, name, grp] of PERMISSIONS) {
      run('INSERT INTO permissions (key, name, grp) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET name = excluded.name, grp = excluded.grp', key, name, grp);
    }
    for (const role of DEFAULT_ROLES) {
      const existing = get('SELECT id FROM roles WHERE key = ?', role.key);
      if (!existing) {
        const info = run('INSERT INTO roles (key, name, description, is_system) VALUES (?, ?, ?, 1)', role.key, role.name, role.description);
        for (const p of role.perms) run('INSERT INTO role_permissions (role_id, perm_key) VALUES (?, ?)', info.lastInsertRowid, p);
      } else {
        // Existing DB: grant permissions introduced in this version to the system roles that have them by default.
        for (const p of role.key === 'admin' ? role.perms : role.perms.filter((x) => added.includes(x))) {
          run('INSERT OR IGNORE INTO role_permissions (role_id, perm_key) VALUES (?, ?)', existing.id, p);
        }
      }
    }
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', k, v);

    if (!get('SELECT 1 FROM users WHERE deleted_at IS NULL LIMIT 1')) {
      const adminRole = get(`SELECT id FROM roles WHERE key = 'admin'`).id;
      run('INSERT INTO users (username, password_hash, full_name, role_id, password_changed_at) VALUES (?, ?, ?, ?, ?)',
        'admin', hashPassword('Admin@1234'), 'ผู้ดูแลระบบ', adminRole, now());
      console.log('  created default user  admin / Admin@1234  — change this password after first login');
    }
  });
}

export function purgeOldLogs() {
  const days = get(`SELECT value FROM settings WHERE key = 'log_retention_days'`)?.value || '730';
  const cutoff = `-${days} days`;
  const a = run(`DELETE FROM access_logs WHERE created_at < datetime('now', ?)`, cutoff).changes;
  const b = run(`DELETE FROM audit_logs WHERE created_at < datetime('now', ?)`, cutoff).changes;
  if (a || b) console.log(`  PDPA retention: purged ${a} access + ${b} audit log rows older than ${days} days`);
}

export const roleId = (key) => all('SELECT id FROM roles WHERE key = ?', key)[0]?.id;
