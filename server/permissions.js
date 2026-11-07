export const PERMISSIONS = [
  ['dashboard.view', 'ดู Dashboard', 'ทั่วไป'],
  ['asset.view', 'ดูรายการอุปกรณ์', 'อุปกรณ์'],
  ['asset.create', 'เพิ่มอุปกรณ์', 'อุปกรณ์'],
  ['asset.edit', 'แก้ไขอุปกรณ์', 'อุปกรณ์'],
  ['asset.delete', 'ลบอุปกรณ์ (soft delete)', 'อุปกรณ์'],
  ['asset.transact', 'ยืม / คืน / เบิก / โอน / ส่งซ่อม', 'อุปกรณ์'],
  ['asset.scrap', 'รอจำหน่าย / Scrap', 'อุปกรณ์'],
  ['loan.view', 'ดูหน้ายืม-คืน', 'อุปกรณ์'],
  ['history.view', 'ดูประวัติรายการ', 'อุปกรณ์'],
  ['consumable.view', 'ดูวัสดุสิ้นเปลือง', 'วัสดุสิ้นเปลือง'],
  ['consumable.manage', 'เพิ่ม / แก้ไขวัสดุสิ้นเปลือง', 'วัสดุสิ้นเปลือง'],
  ['consumable.move', 'รับเข้า / เบิก / ปรับยอด', 'วัสดุสิ้นเปลือง'],
  ['stockcount.manage', 'ตรวจนับ', 'วัสดุสิ้นเปลือง'],
  ['order.create', 'สั่งซื้อสินค้า (ตะกร้า)', 'สั่งซื้อ'],
  ['order.manage', 'อนุมัติ / รับของ / ส่งมอบใบสั่งซื้อ', 'สั่งซื้อ'],
  ['scan.use', 'สแกน QR', 'เครื่องมือ'],
  ['label.print', 'พิมพ์สติ๊กเกอร์ QR', 'เครื่องมือ'],
  ['people.view', 'ดูรายชื่อพนักงาน', 'พนักงาน'],
  ['people.manage', 'เพิ่ม / แก้ไข / ลบพนักงาน', 'พนักงาน'],
  ['master.manage', 'ข้อมูลหลัก (หมวด, สถานที่, แผนก, ผู้ขาย)', 'ตั้งค่า'],
  ['data.import', 'นำเข้า Excel', 'ตั้งค่า'],
  ['report.view', 'ดูรายงาน', 'ทั่วไป'],
  ['report.export', 'ส่งออก Excel', 'ตั้งค่า'],
  ['log.view', 'ดู Access Log / Audit Trail', 'ความปลอดภัย'],
  ['user.manage', 'จัดการผู้ใช้', 'ความปลอดภัย'],
  ['role.manage', 'จัดการบทบาทและสิทธิ์', 'ความปลอดภัย'],
  ['settings.manage', 'ตั้งค่าระบบ', 'ความปลอดภัย'],
];

const ALL = PERMISSIONS.map((p) => p[0]);

// Split out of an older permission: on an existing DB every role holding the old key gets the new one,
// so nobody loses access when they appear.
export const SPLIT_FROM = {
  'loan.view': 'asset.view',
  'history.view': 'asset.view',
  'scan.use': 'asset.view',
  'label.print': 'asset.view',
  'people.view': 'asset.view',
  'people.manage': 'master.manage',
};
const ADMIN_ONLY = ['user.manage', 'role.manage', 'settings.manage'];

export const DEFAULT_ROLES = [
  { key: 'admin', name: 'Admin', description: 'ทำได้ทุกอย่าง', perms: ALL },
  { key: 'it_staff', name: 'IT Staff', description: 'จัดการอุปกรณ์และวัสดุสิ้นเปลือง', perms: ALL.filter((p) => !ADMIN_ONLY.includes(p)) },
  { key: 'viewer', name: 'Viewer', description: 'ดูข้อมูลอย่างเดียว', perms: ['dashboard.view', 'report.view', 'asset.view', 'consumable.view', 'loan.view', 'history.view', 'scan.use', 'label.print', 'people.view'] },
  { key: 'requester', name: 'ผู้สั่งซื้อ', description: 'สั่งซื้อสินค้าผ่านตะกร้า', perms: ['order.create'] },
];

export const DEFAULT_SETTINGS = {
  max_failed_logins: '5',
  lockout_minutes: '15',
  session_idle_minutes: '30',
  log_retention_days: '730',
  warranty_alert_days: '30',
  org_name: 'IT Store',
  public_base_url: '',
};
