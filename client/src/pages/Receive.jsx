import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PackagePlus, Laptop, Package, Trash2, Plus, Save } from 'lucide-react';
import { api } from '../api.js';
import { useLookup } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Field, Select, Empty } from '../components/ui.jsx';
import ItemPicker from '../components/ItemPicker.jsx';
import DocList from '../components/DocList.jsx';
import { fmtMoney, fmtNum, todayISO, daysFromToday } from '../format.js';

let seq = 1;
const newAssetLine = () => ({ key: seq++, kind: 'asset', category_id: '', name: '', brand: '', model: '', qty: '1', unit_price: '', warranty_expiry: '', serialsText: '' });
const serialsOf = (l) => l.serialsText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
const assetQty = (l) => Math.max(serialsOf(l).length, parseInt(l.qty, 10) || 0);

export default function Receive() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const vendors = useLookup('vendors');
  const locs = useLookup('locations');
  const cats = useLookup('categories', { kind: 'asset' });
  const [head, setHead] = useState({ doc_date: todayISO(), purchase_date: '', vendor_id: '', po_number: '', invoice_number: '', location_id: '', note: '' });
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const canCons = can('consumable.move');
  const canAsset = can('asset.create');

  const setH = (k) => (v) => setHead((h) => ({ ...h, [k]: v?.target ? v.target.value : v }));
  const update = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key) => setLines((ls) => ls.filter((l) => l.key !== key));

  const addConsumable = (row) => {
    setLines((ls) => {
      const found = ls.find((l) => l.kind === 'consumable' && l.item.id === row.id);
      if (found) return ls.map((l) => (l === found ? { ...l, qty: String((parseInt(l.qty, 10) || 0) + 1) } : l));
      return [...ls, { key: seq++, kind: 'consumable', item: row, qty: '1', unit_cost: row.price ?? '' }];
    });
  };

  const total = lines.reduce((s, l) => s + (l.kind === 'consumable'
    ? (parseInt(l.qty, 10) || 0) * (Number(l.unit_cost) || 0)
    : assetQty(l) * (Number(l.unit_price) || 0)), 0);
  const assetCount = lines.filter((l) => l.kind === 'asset').reduce((s, l) => s + assetQty(l), 0);
  const unitCount = lines.filter((l) => l.kind === 'consumable').reduce((s, l) => s + (parseInt(l.qty, 10) || 0), 0);

  const submit = async () => {
    const e = {};
    if (!head.doc_date) e.doc_date = 'กรุณาระบุวันที่รับเข้า';
    else if (head.doc_date > todayISO()) e.doc_date = 'วันที่รับเข้าต้องไม่เป็นวันในอนาคต';
    if (head.purchase_date && head.doc_date && head.purchase_date > head.doc_date) e.purchase_date = 'วันที่ซื้อต้องไม่หลังวันที่รับเข้า';
    lines.forEach((l) => {
      if (l.kind === 'consumable' && !(parseInt(l.qty, 10) > 0)) e[`q${l.key}`] = 'จำนวนต้องมากกว่า 0';
      if (l.kind === 'asset') {
        if (!l.category_id) e[`c${l.key}`] = 'เลือกหมวดหมู่';
        if (!l.name.trim()) e[`n${l.key}`] = 'กรอกชื่อ';
        if (!(assetQty(l) > 0)) e[`q${l.key}`] = 'จำนวนต้องมากกว่า 0';
      }
    });
    setErrs(e);
    if (Object.keys(e).length) { toast.error('กรอกข้อมูลให้ครบในช่องที่ไฮไลต์ก่อนบันทึก'); return; }
    setBusy(true);
    try {
      const body = {
        ...head,
        lines: lines.map((l) => (l.kind === 'consumable'
          ? { kind: 'consumable', consumable_id: l.item.id, qty: parseInt(l.qty, 10), unit_cost: l.unit_cost }
          : { kind: 'asset', category_id: l.category_id, name: l.name, brand: l.brand, model: l.model, qty: assetQty(l), unit_price: l.unit_price, warranty_expiry: l.warranty_expiry, serials: serialsOf(l) })),
      };
      const r = await api.post('/api/documents/receive', body);
      toast.success(`บันทึกใบรับเข้า ${r.doc_no} แล้ว`);
      navigate(`/documents/${r.id}`);
    } catch (ex) { toast.error(ex); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="รับเข้า" sub="บันทึกของเข้าคลังเป็นใบรับเข้า — รวมอุปกรณ์รายชิ้นและรายการนับจำนวนได้ในใบเดียว">
        <button className="btn btn-primary" onClick={submit} disabled={busy || !lines.length}>
          <Save size={16} />{busy ? 'กำลังบันทึก…' : `บันทึกรับเข้า${lines.length ? ` (${lines.length} รายการ)` : ''}`}
        </button>
      </PageHeader>

      <Card title="ข้อมูลใบรับเข้า">
        <div className="form-grid cols-3">
          <Field label="วันที่รับเข้า" required error={errs.doc_date}
            hint={head.doc_date && head.doc_date < todayISO() ? `บันทึกย้อนหลัง ${-daysFromToday(head.doc_date)} วัน` : 'เลือกวันที่ย้อนหลังได้ หากรับของไปก่อนแล้วมาบันทึกภายหลัง'}>
            <input type="date" className="input" value={head.doc_date} max={todayISO()} onChange={setH('doc_date')} />
          </Field>
          <Field label="วันที่ซื้อ" error={errs.purchase_date} hint="ใช้กับอุปกรณ์รายชิ้น (ปีในรหัสทรัพย์สิน, ประกัน) — เว้นว่าง = วันที่รับเข้า">
            <input type="date" className="input" value={head.purchase_date} max={head.doc_date || todayISO()} onChange={setH('purchase_date')} />
          </Field>
          <Field label="ผู้ขาย (Vendor)"><Select value={head.vendor_id} onChange={setH('vendor_id')} options={vendors.map((v) => ({ value: v.id, label: v.name }))} /></Field>
          <Field label="เก็บเข้าสถานที่"><Select value={head.location_id} onChange={setH('location_id')} options={locs.map((l) => ({ value: l.id, label: l.name }))} /></Field>
          <Field label="เลข PO"><input className="input mono" value={head.po_number} onChange={setH('po_number')} /></Field>
          <Field label="เลขใบแจ้งหนี้ / ใบส่งของ"><input className="input mono" value={head.invoice_number} onChange={setH('invoice_number')} /></Field>
          <Field label="หมายเหตุ"><input className="input" value={head.note} onChange={setH('note')} /></Field>
        </div>
      </Card>

      <Card title="รายการที่รับเข้า" actions={canAsset && (
        <button className="btn btn-sm" onClick={() => setLines((ls) => [...ls, newAssetLine()])}><Plus size={14} />อุปกรณ์ใหม่ (รายชิ้น)</button>
      )}>
        <div className="stack" style={{ gap: 12 }}>
          {canCons && (
            <div>
              <ItemPicker onPick={addConsumable} accept={(r) => r.kind === 'consumable'}
                reason={() => 'อุปกรณ์รายชิ้นแต่ละชิ้นรับเข้าได้ครั้งเดียว — กด “อุปกรณ์ใหม่ (รายชิ้น)” เพื่อเพิ่มชิ้นใหม่'}
                placeholder="ค้นหาหรือสแกนรายการนับจำนวน (เช่น เมาส์, สาย LAN) เพื่อเพิ่มยอด" />
              <p className="field-hint" style={{ marginTop: 6 }}>
                ยังไม่มีรายการนี้ในระบบ? <Link to="/assets/new">สร้างรายการใหม่</Link> ก่อน แล้วกลับมารับเข้า
              </p>
            </div>
          )}

          {!lines.length ? (
            <Empty icon={PackagePlus} title="ยังไม่มีรายการ">ค้นหา/สแกนรายการนับจำนวน หรือกด “อุปกรณ์ใหม่ (รายชิ้น)”</Empty>
          ) : lines.map((l, i) => (l.kind === 'consumable' ? (
            <div key={l.key} className="line-card">
              <span className="line-no mono">{i + 1}</span>
              <span className="thumb"><Package size={16} /></span>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div className="cell-main">{l.item.name}</div>
                <div className="tag">{l.item.code} · คงเหลือ {fmtNum(l.item.qty_on_hand)} {l.item.unit}</div>
              </div>
              <Field label={`จำนวน (${l.item.unit})`} error={errs[`q${l.key}`]} className="line-field">
                <input type="number" min="1" inputMode="numeric" className="input mono" value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} />
              </Field>
              <Field label="ราคา/หน่วย" className="line-field">
                <input type="number" min="0" step="0.01" inputMode="decimal" className="input mono" value={l.unit_cost} onChange={(e) => update(l.key, { unit_cost: e.target.value })} />
              </Field>
              <div className="line-total mono">{fmtMoney((parseInt(l.qty, 10) || 0) * (Number(l.unit_cost) || 0))}</div>
              <button className="icon-btn plain" onClick={() => remove(l.key)} aria-label={`ลบรายการ ${l.item.name}`}><Trash2 size={16} /></button>
            </div>
          ) : (
            <div key={l.key} className="line-card" style={{ alignItems: 'flex-start' }}>
              <span className="line-no mono">{i + 1}</span>
              <span className="thumb"><Laptop size={16} /></span>
              <div className="form-grid cols-3" style={{ flex: 1, minWidth: 0 }}>
                <Field label="หมวดหมู่" required error={errs[`c${l.key}`]}>
                  <Select value={l.category_id} onChange={(v) => update(l.key, { category_id: v })} options={cats.map((c) => ({ value: c.id, label: c.name }))} />
                </Field>
                <Field label="ชื่อ" required error={errs[`n${l.key}`]} className="span-2">
                  <input className="input" value={l.name} onChange={(e) => update(l.key, { name: e.target.value })} placeholder="เช่น โน้ตบุ๊ก Dell Latitude 5440" />
                </Field>
                <Field label="ยี่ห้อ"><input className="input" value={l.brand} onChange={(e) => update(l.key, { brand: e.target.value })} /></Field>
                <Field label="รุ่น"><input className="input" value={l.model} onChange={(e) => update(l.key, { model: e.target.value })} /></Field>
                <Field label="หมดประกัน"><input type="date" className="input" value={l.warranty_expiry} onChange={(e) => update(l.key, { warranty_expiry: e.target.value })} /></Field>
                <Field label="จำนวน (ชิ้น)" required error={errs[`q${l.key}`]} hint={serialsOf(l).length ? `ตาม Serial ${serialsOf(l).length} ชิ้น` : 'ระบบออกรหัสทรัพย์สินให้ทุกชิ้น'}>
                  <input type="number" min="1" max="200" inputMode="numeric" className="input mono" value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} />
                </Field>
                <Field label="ราคา/ชิ้น (บาท)">
                  <input type="number" min="0" step="0.01" inputMode="decimal" className="input mono" value={l.unit_price} onChange={(e) => update(l.key, { unit_price: e.target.value })} />
                </Field>
                <Field label="รวม"><div className="input mono" style={{ background: 'var(--bg-subtle)' }}>{fmtMoney(assetQty(l) * (Number(l.unit_price) || 0))}</div></Field>
                <Field label="Serial Number" hint="1 บรรทัดต่อ 1 ชิ้น (หรือคั่นด้วยจุลภาค) — สแกนบาร์โค้ดต่อกันได้เลย" className="span-3">
                  <textarea className="textarea mono" rows={2} value={l.serialsText} onChange={(e) => update(l.key, { serialsText: e.target.value })} />
                </Field>
              </div>
              <button className="icon-btn plain" onClick={() => remove(l.key)} aria-label={`ลบรายการที่ ${i + 1}`}><Trash2 size={16} /></button>
            </div>
          )))}
        </div>
        {lines.length > 0 && (
          <div className="line-summary">
            {assetCount > 0 && <span>รายชิ้น <strong className="mono">{fmtNum(assetCount)}</strong> ชิ้น</span>}
            {unitCount > 0 && <span>นับจำนวน <strong className="mono">{fmtNum(unitCount)}</strong> หน่วย</span>}
            <span className="spacer" />
            <span>มูลค่ารวม <strong className="mono" style={{ fontSize: 16 }}>{fmtMoney(total)}</strong></span>
          </div>
        )}
      </Card>

      <DocList type="receive" title="ใบรับเข้าล่าสุด" />
    </>
  );
}
