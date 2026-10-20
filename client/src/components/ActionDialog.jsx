import { useState } from 'react';
import { Paperclip, AlertTriangle } from 'lucide-react';
import { api } from '../api.js';
import { useLookup, clearLookupCache } from '../hooks.js';
import { useToast } from './Toast.jsx';
import { Modal, Field, Select, StatusChip } from './ui.jsx';
import RecipientFields, { EMPTY_RECIPIENT, hasRecipient } from './RecipientFields.jsx';
import { ACTION_META } from './actions.jsx';
import { todayISO, addDaysISO } from '../format.js';

const TARGET = {
  borrow: 'borrowed', issue: 'issued', return: 'available', repair_out: 'repair', repair_in: 'available',
  to_disposal: 'pending_disposal', cancel_disposal: 'available', scrap: 'scrapped',
};

const COPY = {
  borrow: { submit: 'บันทึกการยืม', note: 'วัตถุประสงค์ (ไม่บังคับ)' },
  issue: { submit: 'บันทึกการเบิก', note: 'หมายเหตุ (ไม่บังคับ)' },
  return: { submit: 'รับคืนเข้าคลัง', note: 'สภาพตอนรับคืน', notePh: 'เช่น สภาพดี / มีรอยขีดข่วนที่ฝา' },
  transfer: { submit: 'บันทึกการโอนย้าย', note: 'เหตุผลการโอนย้าย' },
  repair_out: { submit: 'ส่งซ่อม', note: 'อาการเสีย / สาเหตุ', notePh: 'เช่น เปิดไม่ติด, จอเป็นเส้น' },
  repair_in: { submit: 'รับคืนจากซ่อม', note: 'ผลการซ่อม', notePh: 'เช่น เปลี่ยนแบตเตอรี่ใหม่' },
  to_disposal: { submit: 'ส่งรอจำหน่าย', note: 'เหตุผล', notePh: 'เช่น ซ่อมไม่คุ้ม, หมดอายุการใช้งาน' },
  cancel_disposal: { submit: 'ยกเลิกรอจำหน่าย', note: 'เหตุผล (ไม่บังคับ)' },
  scrap: { submit: 'ยืนยัน Scrap', note: 'เหตุผลการ Scrap', notePh: 'เช่น จำหน่ายตามมติคณะกรรมการ ครั้งที่ 3/2026' },
};

export default function ActionDialog({ asset, action, onClose, onDone }) {
  const toast = useToast();
  const locs = useLookup('locations');
  const [v, setV] = useState({ location_id: '', due_date: addDaysISO(7), note: '', cost: '' });
  const [who, setWho] = useState(EMPTY_RECIPIENT);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState({});
  const meta = ACTION_META[action.key];
  const copy = COPY[action.key];
  const needs = action.needs;
  const set = (k) => (x) => { setV((s) => ({ ...s, [k]: x?.target ? x.target.value : x })); setErr((e) => ({ ...e, [k]: null })); };

  const showPerson = ['borrow', 'issue'].includes(action.key) || (action.key === 'transfer' && asset.status !== 'available');
  const showDept = ['borrow', 'issue', 'transfer'].includes(action.key);
  const showLocation = ['borrow', 'issue', 'return', 'transfer', 'repair_in'].includes(action.key);
  const showDue = action.key === 'borrow' || (action.key === 'transfer' && asset.status === 'borrowed');
  const showCost = action.key === 'repair_in';

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (needs.includes('recipient') && !hasRecipient(who)) errs.recipient = 'กรอกชื่อผู้รับ หรือแผนก อย่างน้อยหนึ่งอย่าง';
    if (needs.includes('due_date') && !v.due_date) errs.due_date = 'กรุณาระบุวันกำหนดคืน';
    if (needs.includes('note') && !v.note.trim()) errs.note = 'กรุณากรอกข้อมูลนี้';
    if (needs.includes('evidence') && !file) errs.evidence = 'ต้องแนบหลักฐาน เช่น ใบอนุมัติจำหน่าย หรือรูปถ่าย';
    if (action.key === 'transfer' && !hasRecipient(who) && !v.location_id) errs.recipient = 'ระบุปลายทางอย่างน้อย 1 อย่าง';
    setErr(errs);
    if (Object.keys(errs).length) return;

    const fd = new FormData();
    for (const [k, val] of Object.entries({ ...v, ...(showDept ? who : {}) })) {
      if (k === 'due_date' && !showDue) continue;
      if (val !== '') fd.append(k, val);
    }
    if (file) fd.append('evidence', file);
    setBusy(true);
    try {
      await api.post(`/api/assets/${asset.id}/actions/${action.key}`, fd);
      clearLookupCache();
      toast.success(`${meta.label} ${asset.asset_tag} เรียบร้อย`);
      onDone();
    } catch (ex) {
      toast.error(ex);
    } finally {
      setBusy(false);
    }
  };

  const to = TARGET[action.key];
  return (
    <Modal title={`${meta.label} · ${asset.asset_tag}`} onClose={onClose} footer={(
      <>
        <button type="button" className="btn" onClick={onClose}>ยกเลิก</button>
        <button type="submit" form="action-form" className={action.key === 'scrap' ? 'btn btn-danger' : 'btn btn-primary'} disabled={busy}>
          {busy ? 'กำลังบันทึก…' : copy.submit}
        </button>
      </>
    )}>
      <form id="action-form" onSubmit={submit} className="stack" style={{ gap: 14 }} noValidate>
        <div className="holder">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cell-main">{asset.name}</div>
            <div className="tag">{asset.asset_tag}{(asset.holder_name || (['borrowed', 'issued'].includes(asset.status) && asset.department_name)) && ` · ถือครองโดย ${asset.holder_name || asset.department_name}`}</div>
          </div>
          <div className="row" style={{ gap: 6, fontSize: 12 }}>
            <StatusChip status={asset.status} />
            {to && <><span aria-hidden>→</span><span className="sr-only">เปลี่ยนเป็น</span><StatusChip status={to} /></>}
          </div>
        </div>

        {action.key === 'scrap' && (
          <div className="alert danger"><AlertTriangle size={18} /><span>Scrap แล้วจะย้อนกลับไม่ได้ และอุปกรณ์จะไม่สามารถทำรายการใดๆ ได้อีก</span></div>
        )}

        {(showDept || showLocation) && (
          <div className="form-grid">
            {showDept && (
              <RecipientFields value={who} compact error={err.recipient}
                required={needs.includes('recipient')}
                fields={showPerson ? undefined : ['department_name']}
                onChange={(x) => { setWho(x); setErr((e) => ({ ...e, recipient: null })); }} />
            )}
            {showLocation && (
              <Field label={action.key === 'return' || action.key === 'repair_in' ? 'เก็บเข้าสถานที่' : 'สถานที่ใช้งาน'} hint="เว้นว่าง = คงเดิม">
                <Select value={v.location_id} onChange={set('location_id')} options={locs.map((l) => ({ value: l.id, label: l.name }))} />
              </Field>
            )}
          </div>
        )}
        {showDue && (
          <Field label="กำหนดคืน" required={needs.includes('due_date')} error={err.due_date}>
            <div className="row-wrap">
              <input type="date" className="input" style={{ maxWidth: 200 }} min={todayISO()} value={v.due_date} onChange={set('due_date')} />
              {[3, 7, 14, 30].map((d) => (
                <button type="button" key={d} className="btn btn-sm" aria-pressed={v.due_date === addDaysISO(d)} onClick={() => set('due_date')(addDaysISO(d))}>
                  {d} วัน
                </button>
              ))}
            </div>
          </Field>
        )}
        {showCost && (
          <Field label="ค่าซ่อม (บาท)" hint="ไม่บังคับ — ใช้สรุปค่าซ่อมบำรุง">
            <input type="number" min="0" step="0.01" inputMode="decimal" className="input mono" value={v.cost} onChange={set('cost')} />
          </Field>
        )}
        <Field label={copy.note} required={needs.includes('note')} error={err.note}>
          <textarea className="textarea" rows={2} value={v.note} onChange={set('note')} placeholder={copy.notePh} />
        </Field>
        {(needs.includes('evidence') || action.key === 'to_disposal' || action.key === 'repair_out') && (
          <Field label="แนบหลักฐาน" required={needs.includes('evidence')} error={err.evidence} hint="รูปภาพหรือ PDF ไม่เกิน 8 MB">
            <label className="btn" style={{ justifyContent: 'flex-start', overflow: 'hidden' }}>
              <Paperclip size={14} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{file ? file.name : 'เลือกไฟล์'}</span>
              <input type="file" className="sr-only" accept="image/*,application/pdf"
                onChange={(e) => { setFile(e.target.files?.[0] || null); setErr((x) => ({ ...x, evidence: null })); }} />
            </label>
          </Field>
        )}
      </form>
    </Modal>
  );
}
