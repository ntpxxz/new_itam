import { useState } from 'react';
import { api } from '../api.js';
import { clearLookupCache } from '../hooks.js';
import RecipientFields, { EMPTY_RECIPIENT } from './RecipientFields.jsx';
import { useToast } from './Toast.jsx';
import { Modal, Field } from './ui.jsx';
import { STOCK_META } from './actions.jsx';
import { fmtNum, todayISO } from '../format.js';

export function MoveDialog({ item, type, onClose, onDone }) {
  const toast = useToast();
  const [who, setWho] = useState(EMPTY_RECIPIENT);
  const [v, setV] = useState({ qty: type === 'adjust' ? String(item.qty_on_hand) : '1', note: '', unit_cost: item.unit_cost ?? '', received_date: todayISO() });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState({});
  const set = (k) => (x) => { setV((s) => ({ ...s, [k]: x?.target ? x.target.value : x })); setErr({}); };
  const qty = parseInt(v.qty, 10) || 0;
  const after = type === 'in' ? item.qty_on_hand + qty : type === 'out' ? item.qty_on_hand - qty : qty;
  const meta = STOCK_META[type];

  const submit = async (e) => {
    e.preventDefault();
    if (type !== 'adjust' && qty <= 0) return setErr({ qty: 'กรุณาระบุจำนวนที่มากกว่า 0' });
    if (type === 'out' && qty > item.qty_on_hand) return setErr({ qty: `สต็อกไม่พอ — คงเหลือ ${item.qty_on_hand} ${item.unit}` });
    if (type === 'adjust' && !v.note.trim()) return setErr({ note: 'กรุณาระบุเหตุผลการปรับยอด' });
    if (type === 'in' && (!v.received_date || v.received_date > todayISO())) return setErr({ received_date: 'ระบุวันที่รับเข้า (ไม่เกินวันนี้)' });
    setBusy(true);
    try {
      const r = await api.post(`/api/consumables/${item.id}/move`, { type, ...v, ...(type === 'out' ? who : {}), qty });
      clearLookupCache();
      toast.success(`${meta.label} ${item.name} เรียบร้อย · คงเหลือ ${fmtNum(r.balance)} ${item.unit}`);
      if (r.low) toast.info(`${item.name} ต่ำกว่าจุดสั่งซื้อแล้ว — ควรสั่งซื้อเพิ่ม`);
      onDone();
    } catch (ex) { toast.error(ex); } finally { setBusy(false); }
  };

  return (
    <Modal title={`${meta.label} · ${item.name}`} onClose={onClose} footer={(
      <>
        <button type="button" className="btn" onClick={onClose}>ยกเลิก</button>
        <button type="submit" form="move-form" className="btn btn-primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : `บันทึก${meta.label}`}</button>
      </>
    )}>
      <form id="move-form" onSubmit={submit} className="stack" style={{ gap: 14 }} noValidate>
        <div className="holder">
          <div style={{ flex: 1 }}>
            <div className="cell-main">{item.name}</div>
            <div className="tag">{item.sku}</div>
          </div>
          <div className="text-right">
            <div className="cell-sub">คงเหลือ → หลังทำรายการ</div>
            <div className="mono" style={{ fontWeight: 600 }}>
              {fmtNum(item.qty_on_hand)} → <span className={after < 0 || after <= item.reorder_point ? 'danger-text' : ''}>{fmtNum(after)}</span> {item.unit}
            </div>
          </div>
        </div>
        <Field label={type === 'adjust' ? 'ยอดคงเหลือจริง (จากการตรวจนับ)' : `จำนวน (${item.unit})`} required error={err.qty}>
          <div className="row">
            {type !== 'adjust' && <button type="button" className="icon-btn" aria-label="ลดจำนวน" onClick={() => set('qty')(String(Math.max(1, qty - 1)))}>−</button>}
            <input type="number" inputMode="numeric" min={type === 'adjust' ? 0 : 1} className="input mono" style={{ textAlign: 'center', maxWidth: 140 }}
              value={v.qty} onChange={set('qty')} />
            {type !== 'adjust' && <button type="button" className="icon-btn" aria-label="เพิ่มจำนวน" onClick={() => set('qty')(String(qty + 1))}>+</button>}
          </div>
        </Field>
        {type === 'out' && (<>
          <div className="form-grid">
            <RecipientFields value={who} onChange={setWho} required={false} compact />
          </div>
          <p className="field-hint" style={{ marginTop: -6 }}>ไม่บังคับ — กรอกแผนก/Section เพื่อให้รายงานสรุปการเบิกตามแผนกครบถ้วน</p>
        </>)}
        {type === 'in' && (
          <Field label="วันที่รับเข้า" required error={err.received_date}>
            <input type="date" className="input" style={{ maxWidth: 200 }} value={v.received_date} max={todayISO()} onChange={set('received_date')} />
          </Field>
        )}
        {type === 'in' && (
          <Field label="ราคาต่อหน่วย (บาท)">
            <input type="number" min="0" step="0.01" inputMode="decimal" className="input mono" value={v.unit_cost} onChange={set('unit_cost')} />
          </Field>
        )}
        <Field label={type === 'adjust' ? 'เหตุผล' : type === 'in' ? 'เลข PO / หมายเหตุ' : 'หมายเหตุ'} required={type === 'adjust'}
          error={err.note}>
          <input className="input" value={v.note} onChange={set('note')}
            placeholder={type === 'adjust' ? 'เช่น ผลตรวจนับประจำเดือน' : type === 'in' ? 'เช่น PO-2026-123' : 'เช่น ของเดิมชำรุด'} />
        </Field>
      </form>
    </Modal>
  );
}
