import { useId } from 'react';
import { useLookup } from '../hooks.js';
import { Field } from './ui.jsx';

export const EMPTY_RECIPIENT = { person_name: '', department_name: '' };

export const hasRecipient = (v) => !!(v.person_name.trim() || v.department_name.trim());

// Free-text recipient: name (optional) + department, with suggestions from existing data.
// Name or department is required; typing a known name fills the department automatically.
export default function RecipientFields({ value, onChange, error, required = true, compact, fields = ['person_name', 'department_name'] }) {
  const people = useLookup('people');
  const depts = useLookup('departments');
  const ids = { p: useId(), d: useId() };

  const set = (k) => (e) => {
    const v = { ...value, [k]: e.target.value };
    if (k === 'person_name') {
      const p = people.find((x) => x.name.toLowerCase() === e.target.value.trim().toLowerCase());
      if (p?.department_name && !value.department_name) v.department_name = p.department_name;
    }
    onChange(v);
  };
  const known = people.some((x) => x.name.toLowerCase() === value.person_name.trim().toLowerCase());
  const newDept = value.department_name.trim() && !depts.some((d) => d.name.toLowerCase() === value.department_name.trim().toLowerCase());
  const onlyDept = !fields.includes('person_name');

  return (
    <>
      {fields.includes('person_name') && <>
      <Field label="ชื่อผู้รับ" error={error}
        hint={value.person_name.trim() && !known ? 'ชื่อใหม่ — ระบบจะเพิ่มเข้ารายชื่อพนักงานให้' : required ? 'ไม่บังคับ ถ้ากรอกแผนกแล้ว' : 'ไม่บังคับ'}>
        <input className="input" list={ids.p} value={value.person_name} onChange={set('person_name')} placeholder="พิมพ์ชื่อ หรือเว้นว่าง" autoComplete="off" />
      </Field>
      <datalist id={ids.p}>{people.map((p) => <option key={p.id} value={p.name}>{[p.emp_code, p.department_name].filter(Boolean).join(' · ')}</option>)}</datalist>
      </>}

      {fields.includes('department_name') && <>
      <Field label="แผนก" error={onlyDept ? error : undefined}
        hint={newDept ? 'แผนกใหม่ — ระบบจะเพิ่มให้' : compact || onlyDept ? undefined : 'เติมให้อัตโนมัติเมื่อเลือกชื่อที่มีอยู่ · ใช้แทนชื่อได้'}>
        <input className="input" list={ids.d} value={value.department_name} onChange={set('department_name')} placeholder="พิมพ์ชื่อแผนก" autoComplete="off" />
      </Field>
      <datalist id={ids.d}>{depts.map((d) => <option key={d.id} value={d.name} />)}</datalist>
      </>}
    </>
  );
}
