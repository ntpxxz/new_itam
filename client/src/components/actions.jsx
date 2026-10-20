import {
  PackagePlus, ArrowUpRight, ArrowDownLeft, UserCheck, Repeat, Wrench, CheckCircle2, Archive, Undo2, Trash2, PackageMinus, SlidersHorizontal,
} from 'lucide-react';

// Asset lifecycle actions (mirror of server/lifecycle.js — labels and visuals only)
export const ACTION_META = {
  receive: { label: 'รับเข้าคลัง', icon: PackagePlus, tone: 'success' },
  borrow: { label: 'ยืม', icon: ArrowUpRight, tone: 'brand' },
  issue: { label: 'เบิกถาวร', icon: UserCheck, tone: 'brand' },
  return: { label: 'รับคืน', icon: ArrowDownLeft, tone: 'success' },
  transfer: { label: 'โอนย้าย', icon: Repeat, tone: 'brand' },
  repair_out: { label: 'ส่งซ่อม', icon: Wrench, tone: 'warning' },
  repair_in: { label: 'รับคืนจากซ่อม', icon: CheckCircle2, tone: 'success' },
  to_disposal: { label: 'ส่งรอจำหน่าย', icon: Archive, tone: 'neutral' },
  cancel_disposal: { label: 'ยกเลิกรอจำหน่าย', icon: Undo2, tone: 'success' },
  scrap: { label: 'Scrap', icon: Trash2, tone: 'danger' },
};

export const STOCK_META = {
  in: { label: 'รับเข้า', icon: PackagePlus, tone: 'success' },
  out: { label: 'เบิก', icon: PackageMinus, tone: 'brand' },
  adjust: { label: 'ปรับยอด', icon: SlidersHorizontal, tone: 'warning' },
};

const TONE_COLOR = {
  success: ['var(--success-soft)', 'var(--success)'],
  brand: ['var(--brand-soft)', 'var(--brand)'],
  warning: ['var(--warning-soft)', 'var(--warning)'],
  neutral: ['var(--neutral-soft)', 'var(--neutral)'],
  danger: ['var(--danger-soft)', 'var(--danger-text)'],
};

export function ActionIcon({ meta, size = 14 }) {
  const Icon = meta?.icon || PackagePlus;
  const [bg, fg] = TONE_COLOR[meta?.tone] || TONE_COLOR.neutral;
  return <span className="feed-icon" style={{ background: bg, color: fg }} aria-hidden><Icon size={size} /></span>;
}
