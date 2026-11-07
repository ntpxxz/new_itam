import { all, get, run, tx, now, minutesAgo } from './db.js';
import { PERMISSIONS, DEFAULT_ROLES, DEFAULT_SETTINGS, SPLIT_FROM } from './permissions.js';
import { hashPassword } from './auth.js';

const insertMissing = (table, cols, values) => run(
  `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(', ')}) SELECT ${cols.map(() => '?').join(', ')}
   WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE ${cols.map((c) => `"${c}" = ?`).join(' AND ')})`,
  ...values, ...values,
);

// Idempotent: makes sure permissions, system roles and settings exist. Safe on every boot.
export async function bootstrap() {
  await tx(async () => {
    const known = new Set((await all('SELECT "key" FROM permissions')).map((p) => p.key));
    const added = PERMISSIONS.map((p) => p[0]).filter((k) => !known.has(k));
    for (const [key, name, grp] of PERMISSIONS) {
      if (known.has(key)) await run('UPDATE permissions SET name = ?, grp = ? WHERE "key" = ?', name, grp, key);
      else await run('INSERT INTO permissions ("key", name, grp) VALUES (?, ?, ?)', key, name, grp);
    }
    // Existing DB: a permission split out of an older one goes to every role that holds the older one.
    if (known.size) {
      for (const key of added.filter((k) => SPLIT_FROM[k])) {
        await run('INSERT INTO role_permissions (role_id, perm_key) SELECT role_id, ? FROM role_permissions WHERE perm_key = ?', key, SPLIT_FROM[key]);
      }
    }
    for (const role of DEFAULT_ROLES) {
      const existing = await get('SELECT id FROM roles WHERE "key" = ?', role.key);
      if (!existing) {
        const info = await run('INSERT INTO roles ("key", name, description, is_system) VALUES (?, ?, ?, 1)', role.key, role.name, role.description);
        for (const p of role.perms) await run('INSERT INTO role_permissions (role_id, perm_key) VALUES (?, ?)', info.lastInsertRowid, p);
      } else {
        // Existing DB: grant permissions introduced in this version to the system roles that have them by default.
        for (const p of role.key === 'admin' ? role.perms : role.perms.filter((x) => added.includes(x) && !SPLIT_FROM[x])) {
          await insertMissing('role_permissions', ['role_id', 'perm_key'], [existing.id, p]);
        }
      }
    }
    // Empty defaults (public_base_url) are not stored; setting() falls back to ''.
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      if (v !== '' && !(await get('SELECT 1 AS x FROM settings WHERE "key" = ?', k))) await run('INSERT INTO settings ("key", value) VALUES (?, ?)', k, v);
    }

    if (!(await get('SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL')).n) {
      const adminRole = (await get(`SELECT id FROM roles WHERE "key" = 'admin'`)).id;
      await run('INSERT INTO users (username, password_hash, full_name, role_id, password_changed_at) VALUES (?, ?, ?, ?, ?)',
        'admin', hashPassword('Admin@1234'), 'ผู้ดูแลระบบ', adminRole, now());
      console.log('  created default user  admin / Admin@1234  — change this password after first login');
    }
  });
}

export async function purgeOldLogs() {
  const days = Number((await get(`SELECT value FROM settings WHERE "key" = 'log_retention_days'`))?.value || '730');
  const cutoff = minutesAgo(days * 1440);
  const a = (await run('DELETE FROM access_logs WHERE created_at < ?', cutoff)).changes;
  const b = (await run('DELETE FROM audit_logs WHERE created_at < ?', cutoff)).changes;
  if (a || b) console.log(`  PDPA retention: purged ${a} access + ${b} audit log rows older than ${days} days`);
}

export const roleId = async (key) => (await get('SELECT id FROM roles WHERE "key" = ?', key))?.id;
