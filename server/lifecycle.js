// Single source of truth for asset status transitions.
export const STATUS_LABEL = {
  available: 'พร้อมใช้',
  borrowed: 'ถูกยืม',
  issued: 'เบิกถาวร',
  repair: 'กำลังซ่อม',
  pending_disposal: 'รอจำหน่าย',
  scrapped: 'Scrap',
};

// action -> { from: [...], to: status | null (keep), perm, needs: [...] }
export const ACTIONS = {
  borrow:          { label: 'ยืม',           from: ['available'],                   to: 'borrowed',         perm: 'asset.transact', needs: ['recipient', 'due_date'] },
  issue:           { label: 'เบิกถาวร',      from: ['available'],                   to: 'issued',           perm: 'asset.transact', needs: ['recipient'] },
  return:          { label: 'รับคืน',         from: ['borrowed', 'issued'],          to: 'available',        perm: 'asset.transact', needs: [] },
  transfer:        { label: 'โอนย้าย',       from: ['available', 'borrowed', 'issued'], to: null,          perm: 'asset.transact', needs: [] },
  repair_out:      { label: 'ส่งซ่อม',        from: ['available'],                   to: 'repair',           perm: 'asset.transact', needs: ['note'] },
  repair_in:       { label: 'รับคืนจากซ่อม', from: ['repair'],                      to: 'available',        perm: 'asset.transact', needs: [] },
  to_disposal:     { label: 'ส่งรอจำหน่าย',  from: ['available', 'repair'],         to: 'pending_disposal', perm: 'asset.scrap',    needs: ['note'] },
  cancel_disposal: { label: 'ยกเลิกรอจำหน่าย', from: ['pending_disposal'],          to: 'available',        perm: 'asset.scrap',    needs: [] },
  scrap:           { label: 'Scrap',          from: ['pending_disposal'],            to: 'scrapped',         perm: 'asset.scrap',    needs: ['note', 'evidence'] },
};

export function allowedActions(status, can) {
  return Object.entries(ACTIONS)
    .filter(([, a]) => a.from.includes(status) && can(a.perm))
    .map(([key, a]) => ({ key, label: a.label, needs: a.needs }));
}

export function checkTransition(action, status) {
  const a = ACTIONS[action];
  if (!a) return 'ไม่รู้จักรายการนี้';
  if (!a.from.includes(status)) {
    return `ทำรายการ "${a.label}" ไม่ได้ เพราะอุปกรณ์อยู่ในสถานะ "${STATUS_LABEL[status]}" — ${hint(status)}`;
  }
  return null;
}

function hint(status) {
  switch (status) {
    case 'borrowed':
    case 'issued': return 'ต้องรับคืนเข้าคลังก่อน';
    case 'repair': return 'ต้องรับคืนจากซ่อมก่อน';
    case 'pending_disposal': return 'ยกเลิกรอจำหน่ายก่อน หรือดำเนินการ Scrap';
    case 'scrapped': return 'อุปกรณ์ถูก Scrap แล้ว ไม่สามารถทำรายการได้';
    default: return 'ตรวจสอบสถานะอีกครั้ง';
  }
}
