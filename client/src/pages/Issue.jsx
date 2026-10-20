import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PackageMinus, Laptop, Package, Trash2, Save, Minus, Plus, CalendarClock } from 'lucide-react';
import { api } from '../api.js';
import { clearLookupCache } from '../hooks.js';
import RecipientFields, { EMPTY_RECIPIENT, hasRecipient } from '../components/RecipientFields.jsx';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Field, Select, Empty, StatusChip, STATUS } from '../components/ui.jsx';
import ItemPicker from '../components/ItemPicker.jsx';
import DocList from '../components/DocList.jsx';
import { fmtNum, todayISO, addDaysISO, daysFromToday } from '../format.js';

let seq = 1;

export default function Issue() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const [head, setHead] = useState({ doc_date: todayISO(), mode: sp.get('mode') === 'borrow' ? 'borrow' : 'issue', due_date: addDaysISO(7), note: '' });
  const [who, setWho] = useState(EMPTY_RECIPIENT);
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const canCons = can('consumable.move');
  const canAsset = can('asset.transact');

  const setH = (k) => (v) => { setHead((h) => ({ ...h, [k]: v?.target ? v.target.value : v })); setErrs((e) => ({ ...e, [k]: null })); };

  const accept = (r) => (r.kind === 'asset' ? canAsset && r.status === 'available' : canCons && r.qty_on_hand > 0);
  const reason = (r) => {
    if (r.kind === 'asset') return !canAsset ? 'ไม่มีสิทธิ์เบิกอุปกรณ์รายชิ้น' : r.status !== 'available' ? `อยู่ในสถานะ "${STATUS[r.status]}" — ต้องพร้อมใช้จึงเบิกได้` : '';
    return !canCons ? 'ไม่มีสิทธิ์เบิกรายการนับจำนวน' : r.qty_on_hand <= 0 ? 'สต็อกหมด' : '';
  };

  const add = (row) => {
    setLines((ls) => {
      const found = ls.find((l) => l.item.kind === row.kind && l.item.id === row.id);
      if (found) {
        if (row.kind === 'asset') { toast.info(`${row.code} อยู่ในใบเบิกแล้ว`); return ls; }
        return ls.map((l) => (l === found ? { ...l, qty: Math.min(row.qty_on_hand, l.qty + 1) } : l));
      }
      return [...ls, { key: seq++, item: row, qty: 1 }];
    });
  };
  const setQty = (key, q) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, qty: Math.max(1, Math.min(l.item.qty_on_hand, q || 1)) } : l)));
  const remove = (key) => setLines((ls) => ls.filter((l) => l.key !== key));

  const assetLines = lines.filter((l) => l.item.kind === 'asset');
  const borrowBlocked = head.mode === 'borrow' && lines.some((l) => l.item.kind === 'consumable');

  const submit = async () => {
    const e = {};
    if (!hasRecipient(who)) e.recipient = 'กรอกชื่อผู้รับ หรือ Section อย่างน้อยหนึ่งอย่าง';
    if (!head.doc_date) e.doc_date = 'กรุณาระบุวันที่เบิก';
    else if (head.doc_date > todayISO()) e.doc_date = 'วันที่เบิกต้องไม่เป็นวันในอนาคต';
    if (head.mode === 'borrow' && (!head.due_date || head.due_date < head.doc_date)) e.due_date = 'วันกำหนดคืนต้องไม่ก่อนวันที่เบิก';
    setErrs(e);
    if (Object.keys(e).length) return;
    if (borrowBlocked) { toast.error('รายการนับจำนวนเป็นของสิ้นเปลือง ยืมไม่ได้ — เปลี่ยนเป็น “เบิกออก” หรือลบรายการนั้นออก'); return; }
    setBusy(true);
    try {
      const r = await api.post('/api/documents/issue', {
        ...head,
        ...who,
        due_date: head.mode === 'borrow' ? head.due_date : null,
        lines: lines.map((l) => (l.item.kind === 'asset'
          ? { kind: 'asset', asset_id: l.item.id }
          : { kind: 'consumable', consumable_id: l.item.id, qty: l.qty })),
      });
      clearLookupCache();
      toast.success(`บันทึกใบเบิก ${r.doc_no} แล้ว`);
      navigate(`/documents/${r.id}`);
    } catch (ex) { toast.error(ex); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="เบิกออก" sub="จ่ายอุปกรณ์ให้พนักงานหรือส่วนงานเป็นใบเบิก — สแกนหลายชิ้นต่อกันได้ บันทึกพร้อมกันทั้งใบ">
        <button className="btn btn-primary" onClick={submit} disabled={busy || !lines.length}>
          <Save size={16} />{busy ? 'กำลังบันทึก…' : `บันทึกเบิกออก${lines.length ? ` (${lines.length} รายการ)` : ''}`}
        </button>
      </PageHeader>

      <Card title="ข้อมูลใบเบิก">
        <div className="form-grid cols-3">
          <Field label="วันที่เบิก" required error={errs.doc_date}
            hint={head.doc_date && head.doc_date < todayISO() ? `บันทึกย้อนหลัง ${-daysFromToday(head.doc_date)} วัน` : 'เลือกวันที่ย้อนหลังได้ หากเบิกไปก่อนแล้วมาบันทึกภายหลัง'}>
            <input type="date" className="input" value={head.doc_date} max={todayISO()} onChange={setH('doc_date')} />
          </Field>
          <Field label="ประเภทการเบิก" hint={head.mode === 'borrow' ? 'อุปกรณ์รายชิ้นจะเป็นสถานะ “ถูกยืม” และต้องคืนตามกำหนด' : 'อุปกรณ์รายชิ้นจะเป็นสถานะ “เบิกถาวร”'}>
            <div className="seg" role="group" aria-label="ประเภทการเบิก">
              <button type="button" aria-pressed={head.mode === 'issue'} onClick={() => setH('mode')('issue')}>เบิกออก (ถาวร)</button>
              <button type="button" aria-pressed={head.mode === 'borrow'} onClick={() => setH('mode')('borrow')}>ยืม (มีกำหนดคืน)</button>
            </div>
          </Field>
          {head.mode === 'borrow' && (
            <Field label="กำหนดคืน" required error={errs.due_date}>
              <input type="date" className="input" min={head.doc_date || todayISO()} value={head.due_date} onChange={setH('due_date')} />
            </Field>
          )}
          {head.mode !== 'borrow' && <div aria-hidden />}
          <RecipientFields value={who} onChange={(v) => { setWho(v); setErrs((x) => ({ ...x, recipient: null })); }} error={errs.recipient} />
          <Field label="หมายเหตุ / วัตถุประสงค์" className="span-3">
            <input className="input" value={head.note} onChange={setH('note')} placeholder="เช่น พนักงานใหม่, ของเดิมชำรุด" />
          </Field>
        </div>
      </Card>

      <Card title="รายการที่เบิก">
        <div className="stack" style={{ gap: 12 }}>
          <ItemPicker onPick={add} accept={accept} reason={reason} autoFocus
            placeholder="สแกน QR / บาร์โค้ด หรือพิมพ์รหัส ชื่อ Serial แล้วกด Enter" />
          {head.mode === 'borrow' && head.due_date && head.due_date < todayISO() && (
            <div className="alert"><CalendarClock size={18} /><span className="alert-detail">กำหนดคืนเลยวันนี้มาแล้ว — อุปกรณ์จะแสดงเป็น “เกินกำหนดคืน” ทันทีหลังบันทึก</span></div>
          )}
          {borrowBlocked && (
            <div className="alert"><PackageMinus size={18} /><span className="alert-detail">รายการนับจำนวนยืมไม่ได้ (เป็นของสิ้นเปลือง) — เปลี่ยนประเภทเป็น “เบิกออก” หรือลบรายการนั้น</span></div>
          )}
          {!lines.length ? (
            <Empty icon={PackageMinus} title="ยังไม่มีรายการ">สแกนหรือค้นหาอุปกรณ์ที่พร้อมใช้ หรือรายการนับจำนวนที่มีในสต็อก</Empty>
          ) : lines.map((l, i) => (
            <div key={l.key} className="line-card">
              <span className="line-no mono">{i + 1}</span>
              <span className="thumb">{l.item.kind === 'asset' ? <Laptop size={16} /> : <Package size={16} />}</span>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div className="cell-main">{l.item.name}</div>
                <div className="tag">{l.item.code}{l.item.serial_no && ` · SN ${l.item.serial_no}`} · {l.item.category_name}</div>
              </div>
              {l.item.kind === 'asset' ? (
                <div className="row" style={{ gap: 6 }}>
                  <StatusChip status="available" /><span aria-hidden>→</span><StatusChip status={head.mode === 'borrow' ? 'borrowed' : 'issued'} />
                </div>
              ) : (
                <div className="stack" style={{ gap: 2, alignItems: 'flex-end' }}>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="icon-btn" onClick={() => setQty(l.key, l.qty - 1)} aria-label="ลดจำนวน" disabled={l.qty <= 1}><Minus size={14} /></button>
                    <input type="number" min="1" max={l.item.qty_on_hand} className="input mono" style={{ width: 72, textAlign: 'center' }}
                      value={l.qty} onChange={(e) => setQty(l.key, parseInt(e.target.value, 10))} aria-label={`จำนวน ${l.item.name}`} />
                    <button className="icon-btn" onClick={() => setQty(l.key, l.qty + 1)} aria-label="เพิ่มจำนวน" disabled={l.qty >= l.item.qty_on_hand}><Plus size={14} /></button>
                    <span className="muted" style={{ fontSize: 13, minWidth: 32 }}>{l.item.unit}</span>
                  </div>
                  <span className="cell-sub">คงเหลือหลังเบิก {fmtNum(l.item.qty_on_hand - l.qty)} {l.item.unit}</span>
                </div>
              )}
              <button className="icon-btn plain" onClick={() => remove(l.key)} aria-label={`ลบรายการ ${l.item.name}`}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        {lines.length > 0 && (
          <div className="line-summary">
            {assetLines.length > 0 && <span>รายชิ้น <strong className="mono">{assetLines.length}</strong> ชิ้น</span>}
            {lines.length - assetLines.length > 0 && <span>นับจำนวน <strong className="mono">{fmtNum(lines.filter((l) => l.item.kind === 'consumable').reduce((s, l) => s + l.qty, 0))}</strong> หน่วย</span>}
          </div>
        )}
      </Card>

      <DocList type="issue" title="ใบเบิกล่าสุด" />
    </>
  );
}
