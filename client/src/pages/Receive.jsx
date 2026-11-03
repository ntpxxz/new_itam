import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PackagePlus, Laptop, Package, Trash2, Plus, Save, FileUp } from 'lucide-react';
import { api } from '../api.js';
import { useLookup } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Field, Select, Empty, CategorySelect, KIND_LABEL } from '../components/ui.jsx';
import ItemPicker from '../components/ItemPicker.jsx';
import DocList from '../components/DocList.jsx';
import ReceiveCsvDialog from '../components/ReceiveCsvDialog.jsx';
import { fmtMoney, fmtNum, todayISO, daysFromToday } from '../format.js';

let seq = 1;
// A "new item" line becomes per-unit assets or a new consumable depending on the chosen category's kind.
const newItemLine = () => ({ key: seq++, kind: 'new', category_id: '', name: '', brand: '', model: '', qty: '1', unit_price: '', warranty_expiry: '', serialsText: '',
  sku: '', unit: 'ชิ้น', reorder_point: '' });
const serialsOf = (l) => l.serialsText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
const assetQty = (l) => Math.max(serialsOf(l).length, parseInt(l.qty, 10) || 0);

export default function Receive() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const vendors = useLookup('vendors');
  const locs = useLookup('locations');
  const allCats = useLookup('categories');
  const [head, setHead] = useState({ doc_date: todayISO(), purchase_date: '', vendor_id: '', po_number: '', invoice_number: '', location_id: '', note: '' });
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const [csvOpen, setCsvOpen] = useState(false);
  const canCons = can('consumable.move');
  const canAsset = can('asset.create');
  const canNewCons = canCons && can('consumable.manage');
  const cats = allCats.filter((c) => (c.kind === 'asset' ? canAsset : canNewCons));
  const canNew = canAsset || canNewCons;
  // Effective kind of a line: new lines follow their category (per-unit until one is chosen).
  const kindOf = (l) => (l.kind !== 'new' ? l.kind : cats.find((c) => String(c.id) === String(l.category_id))?.kind || 'asset');
  const qtyOf = (l) => (kindOf(l) === 'asset' ? assetQty(l) : parseInt(l.qty, 10) || 0);

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

  // Rows ticked in the CSV dialog: add to the slip, summing qty into a line that already has the item.
  const addFromCsv = (picked) => {
    setLines((ls) => {
      let next = [...ls];
      for (const { item, qty, unit_cost } of picked) {
        const found = next.find((l) => l.kind === 'consumable' && l.item.id === item.id);
        if (found) next = next.map((l) => (l === found ? { ...l, qty: String((parseInt(l.qty, 10) || 0) + qty) } : l));
        else next.push({ key: seq++, kind: 'consumable', qty: String(qty), unit_cost: unit_cost ?? '',
          item: { id: item.id, code: item.sku, name: item.name, unit: item.unit, qty_on_hand: item.qty_on_hand, price: item.unit_cost } });
      }
      return next;
    });
    const units = picked.reduce((s, r) => s + r.qty, 0);
    toast.success(`เพิ่ม ${picked.length} รายการ (${fmtNum(units)} หน่วย) จากไฟล์แล้ว — ตรวจแล้วกด “บันทึกรับเข้า”`);
  };

  const total = lines.reduce((s, l) => s + qtyOf(l) * (Number(l.kind === 'consumable' ? l.unit_cost : l.unit_price) || 0), 0);
  const assetCount = lines.filter((l) => kindOf(l) === 'asset').reduce((s, l) => s + qtyOf(l), 0);
  const unitCount = lines.filter((l) => kindOf(l) === 'consumable').reduce((s, l) => s + qtyOf(l), 0);

  const submit = async () => {
    const e = {};
    if (!head.doc_date) e.doc_date = 'กรุณาระบุวันที่รับเข้า';
    else if (head.doc_date > todayISO()) e.doc_date = 'วันที่รับเข้าต้องไม่เป็นวันในอนาคต';
    if (head.purchase_date && head.doc_date && head.purchase_date > head.doc_date) e.purchase_date = 'วันที่ซื้อต้องไม่หลังวันที่รับเข้า';
    lines.forEach((l) => {
      if (l.kind === 'consumable' && !(parseInt(l.qty, 10) > 0)) e[`q${l.key}`] = 'จำนวนต้องมากกว่า 0';
      if (l.kind === 'new') {
        if (!l.category_id) e[`c${l.key}`] = 'เลือกหมวดหมู่';
        if (!l.name.trim()) e[`n${l.key}`] = 'กรอกชื่อ';
        if (!(qtyOf(l) > 0)) e[`q${l.key}`] = 'จำนวนต้องมากกว่า 0';
        if (kindOf(l) === 'consumable') {
          const sku = l.sku.trim();
          if (!sku) e[`s${l.key}`] = 'กรอกหรือสแกนบาร์โค้ด';
          else if (/\s/.test(sku) || sku.length > 64) e[`s${l.key}`] = 'ต้องไม่มีช่องว่าง และยาวไม่เกิน 64 ตัวอักษร';
          else if (lines.some((o) => o !== l && o.kind === 'new' && kindOf(o) === 'consumable' && o.sku.trim().toLowerCase() === sku.toLowerCase())) e[`s${l.key}`] = 'SKU ซ้ำกับรายการอื่นในใบนี้';
        }
      }
    });
    setErrs(e);
    if (Object.keys(e).length) { toast.error('กรอกข้อมูลให้ครบในช่องที่ไฮไลต์ก่อนบันทึก'); return; }
    setBusy(true);
    try {
      const body = {
        ...head,
        lines: lines.map((l) => {
          if (l.kind === 'consumable') return { kind: 'consumable', consumable_id: l.item.id, qty: parseInt(l.qty, 10), unit_cost: l.unit_cost };
          if (kindOf(l) === 'consumable') {
            return { kind: 'consumable', category_id: l.category_id, sku: l.sku.trim(), name: l.name, unit: l.unit, reorder_point: l.reorder_point, qty: qtyOf(l), unit_cost: l.unit_price };
          }
          return { kind: 'asset', category_id: l.category_id, name: l.name, brand: l.brand, model: l.model, qty: assetQty(l), unit_price: l.unit_price, warranty_expiry: l.warranty_expiry, serials: serialsOf(l) };
        }),
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

      <Card title="รายการที่รับเข้า" actions={(canCons || canNew) && (
        <div className="row" style={{ gap: 8 }}>
          {canCons && <button className="btn btn-sm" onClick={() => setCsvOpen(true)}><FileUp size={14} />นำเข้า CSV</button>}
          {canNew && <button className="btn btn-sm" onClick={() => setLines((ls) => [...ls, newItemLine()])}><Plus size={14} />รายการใหม่</button>}
        </div>
      )}>
        <div className="stack" style={{ gap: 12 }}>
          {canCons && (
            <div>
              <ItemPicker onPick={addConsumable} accept={(r) => r.kind === 'consumable'}
                reason={() => 'อุปกรณ์รายชิ้นแต่ละชิ้นรับเข้าได้ครั้งเดียว — กด “รายการใหม่” เพื่อเพิ่มชิ้นใหม่'}
                placeholder="ค้นหาหรือสแกนรายการนับจำนวนที่มีอยู่ (เช่น เมาส์, สาย LAN) เพื่อเพิ่มยอด" />
              {canNew && <p className="field-hint" style={{ marginTop: 6 }}>ยังไม่มีรายการนี้ในระบบ? กด “รายการใหม่” — เลือกหมวดหมู่ได้ทั้งแบบรายชิ้นและนับจำนวน</p>}
            </div>
          )}

          {!lines.length ? (
            <Empty icon={PackagePlus} title="ยังไม่มีรายการ">ค้นหา/สแกนรายการที่มีอยู่ หรือกด “รายการใหม่”</Empty>
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
          ) : kindOf(l) === 'consumable' ? (
            <div key={l.key} className="line-card" style={{ alignItems: 'flex-start' }}>
              <span className="line-no mono">{i + 1}</span>
              <span className="thumb"><Package size={16} /></span>
              <div className="form-grid cols-3" style={{ flex: 1, minWidth: 0 }}>
                <Field label="หมวดหมู่" required error={errs[`c${l.key}`]} hint={`${KIND_LABEL.consumable} — สร้างรายการใหม่และรับเข้าสต็อก`}>
                  <CategorySelect value={l.category_id} onChange={(v) => update(l.key, { category_id: v })} categories={cats} />
                </Field>
                <Field label="ชื่อ" required error={errs[`n${l.key}`]} className="span-2">
                  <input className="input" value={l.name} onChange={(e) => update(l.key, { name: e.target.value })} placeholder="เช่น เมาส์ USB Logitech B100" />
                </Field>
                <Field label="SKU (บาร์โค้ด)" required error={errs[`s${l.key}`]} hint="สแกนหรือพิมพ์บาร์โค้ดของสินค้า">
                  <input className="input mono" value={l.sku} onChange={(e) => update(l.key, { sku: e.target.value })} />
                </Field>
                <Field label="หน่วยนับ"><input className="input" value={l.unit} onChange={(e) => update(l.key, { unit: e.target.value })} placeholder="ชิ้น, เส้น, ตลับ" /></Field>
                <Field label="จุดสั่งซื้อ" hint="แจ้งเตือนเมื่อคงเหลือ ≤ ค่านี้">
                  <input type="number" min="0" inputMode="numeric" className="input mono" value={l.reorder_point} onChange={(e) => update(l.key, { reorder_point: e.target.value })} />
                </Field>
                <Field label={`จำนวน (${l.unit || 'ชิ้น'})`} required error={errs[`q${l.key}`]}>
                  <input type="number" min="1" inputMode="numeric" className="input mono" value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} />
                </Field>
                <Field label="ราคา/หน่วย (บาท)">
                  <input type="number" min="0" step="0.01" inputMode="decimal" className="input mono" value={l.unit_price} onChange={(e) => update(l.key, { unit_price: e.target.value })} />
                </Field>
                <Field label="รวม"><div className="input mono" style={{ background: 'var(--bg-subtle)' }}>{fmtMoney(qtyOf(l) * (Number(l.unit_price) || 0))}</div></Field>
              </div>
              <button className="icon-btn plain" onClick={() => remove(l.key)} aria-label={`ลบรายการที่ ${i + 1}`}><Trash2 size={16} /></button>
            </div>
          ) : (
            <div key={l.key} className="line-card" style={{ alignItems: 'flex-start' }}>
              <span className="line-no mono">{i + 1}</span>
              <span className="thumb"><Laptop size={16} /></span>
              <div className="form-grid cols-3" style={{ flex: 1, minWidth: 0 }}>
                <Field label="หมวดหมู่" required error={errs[`c${l.key}`]}
                  hint={!cats.length
                    ? (can('master.manage')
                      ? <>ยังไม่มีหมวดหมู่ — <Link to="/master?tab=categories">เพิ่มหมวดหมู่</Link> ก่อน</>
                      : 'ยังไม่มีหมวดหมู่ — ให้ผู้ดูแลระบบเพิ่มที่ ข้อมูลหลัก → หมวดหมู่')
                    : l.category_id ? `${KIND_LABEL.asset} — ระบบออกรหัสทรัพย์สินให้ทุกชิ้น` : 'เลือกได้ทั้งแบบรายชิ้นและนับจำนวน'}>
                  <CategorySelect value={l.category_id} onChange={(v) => update(l.key, { category_id: v })} categories={cats}
                    placeholder={cats.length ? undefined : '— ยังไม่มีหมวดหมู่ —'} />
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
      {csvOpen && <ReceiveCsvDialog onAdd={addFromCsv} onClose={() => setCsvOpen(false)} />}
    </>
  );
}
