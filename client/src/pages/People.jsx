import { Link } from 'react-router-dom';
import { useLookup } from '../hooks.js';
import { PageHeader } from '../components/ui.jsx';
import MasterTable from '../components/MasterTable.jsx';

export default function People() {
  const depts = useLookup('departments');
  return (
    <>
      <PageHeader title="พนักงาน" sub="รายชื่อผู้ยืม/ผู้รับอุปกรณ์ (ไม่จำเป็นต้องมีบัญชีเข้าระบบ)" />
      <MasterTable table="people" title="รายชื่อพนักงาน" addLabel="เพิ่มพนักงาน" searchable columns={[
        { key: 'name', label: 'ชื่อ-นามสกุล', input: 'text', required: true, render: (r) => <Link to={`/assets?q=${encodeURIComponent(r.name)}`}>{r.name}</Link> },
        { key: 'emp_code', label: 'รหัสพนักงาน', input: 'text', mono: true },
        { key: 'department_id', label: 'แผนก', input: 'select', options: depts.map((d) => ({ value: d.id, label: d.name })), render: (r) => r.department_name || '—' },
        { key: 'email', label: 'อีเมล', input: 'email' },
        { key: 'phone', label: 'โทรศัพท์', input: 'text' },
      ]} />
    </>
  );
}
