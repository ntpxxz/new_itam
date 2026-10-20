import { get, run } from './db.js';
import { audit } from './audit.js';
import { HttpError } from './routes/util.js';

const clean = (s) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ') : '');

// Turns typed recipient fields into ids. Name and department are free text: an exact (case-insensitive)
// match links to the existing record, otherwise a new one is created so reports still group correctly.
// Name is optional; a recipient needs a name OR a department (e.g. issuing to the whole department).
export function resolveRecipient(req, input, { required = true } = {}) {
  const b = input || {};
  const name = clean(b.person_name);
  const deptName = clean(b.department_name);
  let person_id = b.person_id ? Number(b.person_id) : null;
  let department_id = b.department_id ? Number(b.department_id) : null;

  if (deptName) {
    const d = get('SELECT id FROM departments WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL', deptName);
    if (d) department_id = d.id;
    else {
      department_id = Number(run('INSERT INTO departments (name) VALUES (?)', deptName).lastInsertRowid);
      audit(req, 'departments', department_id, 'create', null, { name: deptName, via: 'recipient' });
    }
  }

  if (name) {
    const p = get('SELECT id, department_id FROM people WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL', name);
    if (p) {
      person_id = p.id;
      if (!department_id) department_id = p.department_id;
    } else {
      person_id = Number(run('INSERT INTO people (name, department_id) VALUES (?, ?)', name, department_id).lastInsertRowid);
      audit(req, 'people', person_id, 'create', null, { name, department_id, via: 'recipient' });
    }
  } else if (person_id) {
    const p = get('SELECT department_id FROM people WHERE id = ? AND deleted_at IS NULL', person_id);
    if (!p) throw new HttpError(400, 'ไม่พบพนักงานที่เลือก');
    if (!department_id) department_id = p.department_id;
  }

  if (required && !person_id && !department_id) {
    throw new HttpError(400, 'กรุณากรอกชื่อผู้รับ หรือแผนก อย่างน้อยหนึ่งอย่าง');
  }
  return { person_id, department_id };
}
