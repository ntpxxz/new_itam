export const PERMISSIONS = [
  ['dashboard.view', 'ดู Dashboard', 'ทั่วไป'],
  ['asset.view', 'ดูรายการอุปกรณ์', 'อุปกรณ์'],
  ['asset.create', 'เพิ่มอุปกรณ์', 'อุปกรณ์'],
  ['asset.edit', 'แก้ไขอุปกรณ์', 'อุปกรณ์'],
  ['asset.delete', 'ลบอุปกรณ์ (soft delete)', 'อุปกรณ์'],
  ['asset.transact', 'ยืม / คืน / เบิก / โอน / ส่งซ่อม', 'อุปกรณ์'],
  ['asset.scrap', 'รอจำหน่าย / Scrap', 'อุปกรณ์'],
  ['consumable.view', 'ดูวัสดุสิ้นเปลือง', 'วัสดุสิ้นเปลือง'],
  ['consumable.manage', 'เพิ่ม / แก้ไขวัสดุสิ้นเปลือง', 'วัสดุสิ้นเปลือง'],
  ['consumable.move', 'รับเข้า / เบิก / ปรับยอด', 'วัสดุสิ้นเปลือง'],
  ['stockcount.manage', 'ตรวจนับ', 'วัสดุสิ้นเปลือง'],
  ['master.manage', 'ข้อมูลหลัก (หมวด, สถานที่, แผนก, ผู้ขาย, พนักงาน)', 'ตั้งค่า'],
  ['data.import', 'นำเข้า Excel', 'ตั้งค่า'],
  ['report.view', 'ดูรายงาน', 'ทั่วไป'],
  ['report.export', 'ส่งออก Excel', 'ตั้งค่า'],
  ['log.view', 'ดู Access Log / Audit Trail', 'ความปลอดภัย'],
  ['user.manage', 'จัดการผู้ใช้', 'ความปลอดภัย'],
  ['role.manage', 'จัดการบทบาทและสิทธิ์', 'ความปลอดภัย'],
  ['settings.manage', 'ตั้งค่าระบบ', 'ความปลอดภัย'],
];

const ALL = PERMISSIONS.map((p) => p[0]);
const ADMIN_ONLY = ['user.manage', 'role.manage', 'settings.manage'];

export const DEFAULT_ROLES = [
  { key: 'admin', name: 'Admin', description: 'ทำได้ทุกอย่าง', perms: ALL },
  { key: 'it_staff', name: 'IT Staff', description: 'จัดการอุปกรณ์และวัสดุสิ้นเปลือง', perms: ALL.filter((p) => !ADMIN_ONLY.includes(p)) },
  { key: 'viewer', name: 'Viewer', description: 'ดูข้อมูลอย่างเดียว', perms: ['dashboard.view', 'report.view', 'asset.view', 'consumable.view'] },
];

export const DEFAULT_SETTINGS = {
  max_failed_logins: '5',
  lockout_minutes: '15',
  session_idle_minutes: '30',
  log_retention_days: '730',
  warranty_alert_days: '30',
  org_name: 'AssetFlow',
  public_base_url: '',
};
