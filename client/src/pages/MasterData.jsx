import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs, Chip } from '../components/ui.jsx';
import MasterTable from '../components/MasterTable.jsx';

const TABS = [
  { value: 'categories', label: 'หมวดหมู่' },
  { value: 'locations', label: 'สถานที่ / สาขา' },
  { value: 'departments', label: 'แผนก' },
  { value: 'vendors', label: 'ผู้ขาย' },
];

const KIND = [{ value: 'asset', label: 'รายชิ้น — มีรหัสทรัพย์สิน ยืม/คืน/ซ่อมได้' }, { value: 'consumable', label: 'นับจำนวน — วัสดุสิ้นเปลือง รับเข้า/เบิก' }];

export default function MasterData() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'categories';
  return (
    <>
      <PageHeader title="ข้อมูลหลัก" sub="ตัวเลือกที่ใช้ในฟอร์มอุปกรณ์และวัสดุสิ้นเปลือง" />
      <Tabs tabs={TABS} value={tab} onChange={(t) => setSp({ tab: t }, { replace: true })} />
      {tab === 'categories' && (
        <MasterTable key="c" table="categories" title="หมวดหมู่" addLabel="เพิ่มหมวดหมู่" columns={[
          { key: 'name', label: 'ชื่อหมวดหมู่', input: 'text', required: true },
          { key: 'kind', label: 'วิธีติดตาม', input: 'select', options: KIND, required: true, default: 'asset',
            render: (r) => (r.kind === 'asset' ? <Chip tone="brand" dot={false}>รายชิ้น</Chip> : <Chip tone="success" dot={false}>นับจำนวน</Chip>) },
          { key: 'prefix', label: 'Prefix รหัส', input: 'text', required: true, mono: true, upper: true, max: 6, hint: 'ใช้นำหน้ารหัสทรัพย์สิน เช่น NB → NB-2026-00001' },
          { key: 'usage', label: 'จำนวนรายการ', mono: true, render: (r) => r.usage },
        ]} />
      )}
      {tab === 'locations' && (
        <MasterTable key="l" table="locations" title="สถานที่ / สาขา" addLabel="เพิ่มสถานที่" columns={[
          { key: 'name', label: 'ชื่อสถานที่', input: 'text', required: true },
          { key: 'branch', label: 'สาขา', input: 'text' },
        ]} />
      )}
      {tab === 'departments' && (
        <MasterTable key="d" table="departments" title="แผนก" addLabel="เพิ่มแผนก" columns={[
          { key: 'name', label: 'ชื่อแผนก', input: 'text', required: true },
        ]} />
      )}
      {tab === 'vendors' && (
        <MasterTable key="v" table="vendors" title="ผู้ขาย (Vendor)" addLabel="เพิ่มผู้ขาย" columns={[
          { key: 'name', label: 'ชื่อบริษัท', input: 'text', required: true },
          { key: 'contact', label: 'ผู้ติดต่อ', input: 'text' },
          { key: 'phone', label: 'โทรศัพท์', input: 'text' },
          { key: 'email', label: 'อีเมล', input: 'email' },
        ]} />
      )}
    </>
  );
}
