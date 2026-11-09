import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList, FileUp, Download, AlertTriangle, PackageCheck, PackagePlus, Search, Trash2, XCircle, Check } from 'lucide-react';
import { api } from '../api.js';
import { useLookup } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Field, Select, Empty, Loading, Modal, Confirm, Chip, Tabs, ActionBar, Menu } from '../components/ui.jsx';
import { fmtMoney, fmtNum, fmtDateTime, todayISO } from '../format.js';
import { readCsvFile, receiveRows, downloadReceiveTemplate } from '../csv.js';

// รายการรอรับเข้า: upload a file of expected goods now, tick and receive them later (a normal RCV slip).
// Each line is ready · new (create the item here first) · incomplete (fix SKU / quantity in the row).
const newItemUrl = (r) => `/assets/new?${new URLSearchParams({ sku: r.sku, ...(r.name && { name: r.name }), ...(r.unit_cost != null && { unit_cost: r.unit_cost }) })}`;

export default function PendingReceive() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const canMove = can('consumable.move');
  const [status, setStatus] = useState('pending');
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') || '');
  const [data, setData] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(null);
  const [creating, setCreating] = useState(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = () => api.get('/api/pending-receipts', { status, q }).then(setData).catch((e) => toast.error(e));
  useEffect(() => { setData(null); setPicked(new Set()); load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = data?.rows || [];
  const pending = status === 'pending';
  const ready = rows.filter((r) => r.state === 'ready');
  const unknown = rows.filter((r) => r.state === 'new');
  const incomplete = rows.filter((r) => r.state === 'incomplete');
  const chosen = rows.filter((r) => picked.has(r.id));
  const chosenReady = chosen.filter((r) => r.state === 'ready');
  const allPicked = ready.length > 0 && ready.every((r) => picked.has(r.id));
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const parsed = receiveRows(await readCsvFile(file));
      const r = await api.post('/api/pending-receipts/upload', { file_name: file.name, rows: parsed });
      const later = [r.unknown && `ยังไม่มีในระบบ ${r.unknown}`, r.incomplete && `ข้อมูลไม่ครบ ${r.incomplete}`].filter(Boolean);
      toast.success(`เพิ่ม ${fmtNum(r.added)} รายการเข้ารอรับเข้าแล้ว — พร้อมรับเข้า ${fmtNum(r.ready)}${later.length ? ` · ${later.join(' · ')}` : ''}`);
      setNotes(r.notes?.length ? r.notes : null);
      if (status !== 'pending') setStatus('pending'); else load();
    } catch (err) {
      toast.error(err.message || err);
    } finally { setBusy(false); }
  };

  // Row edits save on blur; show กำลังบันทึก… → ✓ บันทึกแล้ว (fades) or an error next to the row's status.
  const [saving, setSaving] = useState({});
  const timers = useRef({});
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);
  const markRow = (id, state) => {
    clearTimeout(timers.current[id]);
    setSaving((s) => ({ ...s, [id]: state }));
    if (state === 'saved') timers.current[id] = setTimeout(() => setSaving((s) => { const n = { ...s }; delete n[id]; return n; }), 2000);
  };
  const saveLine = async (r, patch) => {
    markRow(r.id, 'saving');
    try {
      const updated = await api.put(`/api/pending-receipts/${r.id}`, patch);
      setData((d) => ({ ...d, rows: d.rows.map((x) => (x.id === r.id ? updated : x)) }));
      markRow(r.id, 'saved');
    } catch (e) { toast.error(e); markRow(r.id, 'error'); load(); }
  };

  const cancel = async () => {
    try {
      await api.post('/api/pending-receipts/cancel', { ids: chosen.map((r) => r.id) });
      toast.success(`ยกเลิก ${chosen.length} รายการแล้ว`);
      setPicked(new Set());
      load();
    } catch (e) { toast.error(e); }
  };

  const remove = async () => {
    try {
      await api.post('/api/pending-receipts/delete', { ids: deleting.map((r) => r.id) });
      toast.success(`ลบ ${deleting.length} รายการแล้ว`);
      setPicked(new Set());
      load();
    } catch (e) { toast.error(e); }
  };

  const counts = data?.counts || {};
  const canDelete = canMove && status !== 'received';
  const edit = pending && canMove;
  return (
    <>
      <PageHeader title="รายการรอรับเข้า" sub="รายการจากใบสั่งซื้อ (PO) และไฟล์ CSV รออยู่ที่นี่ — ของมาถึงแล้วให้ติ๊กรายการ แล้วกด “รับเข้าที่เลือก” ด้านล่าง สต็อกจะอัปเดตเมื่อรับเข้าเท่านั้น" />

      <Card noBody>
        <div className="toolbar" style={{ flexWrap: 'wrap' }}>
          <Tabs value={status} onChange={setStatus} tabs={[
            { value: 'pending', label: `รอรับเข้า${counts.pending ? ` (${counts.pending})` : ''}` },
            { value: 'received', label: 'รับเข้าแล้ว' },
            { value: 'cancelled', label: 'ยกเลิก' },
          ]} />
          <div className="input-icon" style={{ flex: '1 1 220px' }}>
            <Search size={16} aria-hidden />
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา SKU, ชื่อ, ชื่อไฟล์, เลขรายการสั่งซื้อ" aria-label="ค้นหารายการรอรับเข้า" />
          </div>
          {canMove && (
            <>
              <label className="btn" aria-disabled={busy}>
                <FileUp size={16} />{busy ? 'กำลังอัปโหลด…' : 'อัปโหลดไฟล์ CSV'}
                <input type="file" accept=".csv,text/csv" className="sr-only" onChange={upload} disabled={busy} />
              </label>
              <button className="btn btn-ghost" onClick={downloadReceiveTemplate}><Download size={16} />แม่แบบ</button>
            </>
          )}
        </div>

        <div className="card-body stack" style={{ gap: 12 }}>
          {notes && (
            <div className="alert">
              <AlertTriangle size={18} />
              <span className="alert-detail">
                <strong>{notes.length} แถวในไฟล์ราคาไม่ถูกต้อง</strong> — เว้นราคาไว้ (ใช้ราคาของรายการแทน) แก้ได้ในช่องราคา: {notes.slice(0, 5).map((n) => `แถว ${n.line}${n.sku ? ` (${n.sku})` : ''}`).join(' · ')}{notes.length > 5 ? ' · …' : ''}
              </span>
              <button className="btn btn-sm btn-ghost" onClick={() => setNotes(null)}>ปิด</button>
            </div>
          )}
          {pending && incomplete.length > 0 && (
            <div className="alert danger">
              <AlertTriangle size={18} />
              <span className="alert-detail">
                <strong>มี {incomplete.length} รายการข้อมูลไม่ครบ</strong> — กรอกบาร์โค้ด/SKU หรือจำนวนในแถวนั้นให้ครบ (บันทึกเมื่อออกจากช่อง) หรือติ๊กเลือกแล้วกด “จัดการ…” → ยกเลิก
              </span>
            </div>
          )}
          {pending && unknown.length > 0 && (
            <div className="alert">
              <AlertTriangle size={18} />
              <span className="alert-detail">
                <strong>มี {unknown.length} รายการที่ยังไม่มีในระบบ</strong> — กด “สร้างรายการใหม่” ในแถวนั้น (สร้างที่หน้านี้ได้เลย สต็อกเริ่มต้น 0) หรือแก้ SKU ให้ตรงกับรายการที่มีอยู่ แล้วรายการจะพร้อมรับเข้าเอง
              </span>
            </div>
          )}

          {!data ? <Loading /> : !rows.length ? (
            <Empty icon={ClipboardList} title={pending ? 'ไม่มีรายการรอรับเข้า' : 'ไม่มีรายการ'}>
              {pending && canMove ? 'อัปโหลดไฟล์ CSV ที่มีคอลัมน์ Barcode และ Quantity เพื่อเพิ่มรายการ' : null}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {pending && canMove && (
                      <th style={{ width: 40 }}>
                        <input type="checkbox" className="check" checked={allPicked} disabled={!ready.length}
                          onChange={() => setPicked(allPicked ? new Set() : new Set(ready.map((r) => r.id)))} aria-label="เลือกทุกรายการที่พร้อมรับเข้า" />
                      </th>
                    )}
                    <th>SKU / รายการ</th>
                    <th>ไฟล์</th>
                    <th className="text-right">คงเหลือ</th>
                    <th className="text-right">จำนวน</th>
                    <th className="text-right">ราคา/หน่วย</th>
                    <th>สถานะ</th>
                    {canDelete && <th style={{ width: 44 }}><span className="sr-only">ลบ</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      {pending && canMove && (
                        <td>
                          <input type="checkbox" className="check" checked={picked.has(r.id)} onChange={() => toggle(r.id)}
                            aria-label={`เลือก ${r.item_name || r.name || r.sku}`} />
                        </td>
                      )}
                      <td style={{ minWidth: 220 }}>
                        {r.item_id ? <Link to={`/consumables/${r.item_id}`} className="cell-main">{r.item_name}</Link> : <div className="cell-main">{r.name || '—'}</div>}
                        {edit && r.state !== 'ready' && !r.order_line_id ? (
                          <input className="input mono" style={{ marginTop: 4, maxWidth: 220 }} defaultValue={r.sku ?? ''} key={`s${r.id}-${r.sku}`}
                            placeholder="บาร์โค้ด/SKU" aria-label={`บาร์โค้ด/SKU แถว ${r.line_no ?? ''}`}
                            onBlur={(e) => { const v = e.target.value.trim(); if (v !== (r.sku ?? '')) saveLine(r, { sku: v }); }} />
                        ) : r.order_kind === 'asset' ? (
                          <div className="cell-sub">{['รายชิ้น · สร้างเครื่องใหม่เมื่อรับเข้า', r.order_brand, r.order_model].filter(Boolean).join(' · ')}</div>
                        ) : (
                          <div className="tag">{r.sku}{r.item_id && r.name && r.name.toLowerCase() !== r.item_name.toLowerCase() ? ` · ในไฟล์: ${r.name}` : ''}</div>
                        )}
                      </td>
                      <td>
                        <div className="cell-sub">
                          {r.order_id ? <Link to={`/orders/${r.order_id}`} className="mono">{r.order_no}</Link> : r.file_name || '—'}
                          {r.line_no ? ` · ${r.order_id ? 'รายการ' : 'แถว'} ${r.line_no}` : ''}
                        </div>
                        {r.po_no && <div className="cell-sub">{can('order.manage') ? <Link to={`/purchase-orders/${r.po_id}`} className="mono">{r.po_no}</Link> : <span className="mono">{r.po_no}</span>}</div>}
                        <div className="cell-sub">{fmtDateTime(r.created_at)} · {r.created_by_name}</div>
                      </td>
                      <td className="text-right mono">{r.item_id ? `${fmtNum(r.qty_on_hand)} ${r.unit}` : '—'}</td>
                      <td className="text-right">
                        {edit ? (
                          <input type="number" min="1" inputMode="numeric" className="input mono" style={{ width: 84, textAlign: 'right' }}
                            defaultValue={r.qty ?? ''} key={`q${r.id}-${r.qty}`} aria-label={`จำนวน ${r.sku || `แถว ${r.line_no ?? ''}`}`}
                            onBlur={(e) => { const v = parseInt(e.target.value, 10); if (v !== r.qty) saveLine(r, { qty: Number.isNaN(v) ? 0 : v }); }} />
                        ) : <span className="mono">{fmtNum(r.qty)}</span>}
                      </td>
                      <td className="text-right">
                        {edit ? (
                          <input type="number" min="0" step="0.01" inputMode="decimal" className="input mono" style={{ width: 104, textAlign: 'right' }}
                            defaultValue={r.unit_cost ?? ''} key={`c${r.id}-${r.unit_cost}`} placeholder={r.item_unit_cost != null ? String(r.item_unit_cost) : '—'}
                            aria-label={`ราคาต่อหน่วย ${r.sku || `แถว ${r.line_no ?? ''}`}`}
                            onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== r.unit_cost) saveLine(r, { unit_cost: v }); }} />
                        ) : <span className="mono">{fmtMoney(r.unit_cost ?? r.item_unit_cost)}</span>}
                      </td>
                      <td>
                        {saving[r.id] && (
                          <div className={`save-state ${saving[r.id]}`} role="status">
                            {saving[r.id] === 'saving' ? 'กำลังบันทึก…' : saving[r.id] === 'saved' ? <><Check size={12} aria-hidden />บันทึกแล้ว</> : 'บันทึกไม่สำเร็จ — แก้แล้วลองอีกครั้ง'}
                          </div>
                        )}
                        {r.status === 'received' && (
                          <div className="stack" style={{ gap: 4, alignItems: 'flex-start' }}>
                            <Chip tone="success">รับเข้าแล้ว</Chip>
                            {r.doc_id && <Link to={`/documents/${r.doc_id}`} className="cell-sub mono">{r.doc_no}</Link>}
                          </div>
                        )}
                        {r.status === 'cancelled' && <Chip tone="neutral">ยกเลิก</Chip>}
                        {pending && r.state === 'ready' && <Chip tone="success">พร้อมรับเข้า</Chip>}
                        {pending && r.state === 'new' && (
                          <div className="stack" style={{ gap: 4, alignItems: 'flex-start' }}>
                            <Chip tone="warning">ยังไม่มีในระบบ</Chip>
                            {can('consumable.manage') && (
                              <button className="btn btn-sm" onClick={() => setCreating(r)}><PackagePlus size={14} />สร้างรายการใหม่</button>
                            )}
                          </div>
                        )}
                        {pending && r.state === 'incomplete' && (
                          <div className="stack" style={{ gap: 4, alignItems: 'flex-start' }}>
                            <Chip tone="danger">ข้อมูลไม่ครบ</Chip>
                            <span className="cell-sub">{r.problem}</span>
                          </div>
                        )}
                      </td>
                      {canDelete && (
                        <td>
                          <button className="icon-btn plain" onClick={() => setDeleting([r])} aria-label={`ลบ ${r.item_name || r.name || r.sku || `แถว ${r.line_no ?? ''}`}`} title="ลบ">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </Card>

      {pending && canMove && chosen.length > 0 && (
        <ActionBar label="รายการที่เลือก">
          <span>เลือก <strong className="mono">{chosen.length}</strong> รายการ · พร้อมรับเข้า <strong className="mono">{chosenReady.length}</strong>
            {' '}· รวม <strong className="mono">{fmtNum(chosenReady.reduce((s, r) => s + r.qty, 0))}</strong> หน่วย</span>
          <span className="spacer" />
          <Menu label="จัดการรายการที่เลือก" buttonClass="btn" icon={<>จัดการ…</>} items={[
            { label: 'ยกเลิก (เก็บไว้ในแท็บ “ยกเลิก”)', onClick: () => setCancelOpen(true), icon: <XCircle size={15} /> },
            { label: 'ลบออกจากรายการ', onClick: () => setDeleting(chosen), icon: <Trash2 size={15} />, danger: true },
          ]} />
          <button className="btn btn-primary" onClick={() => setReceiveOpen(true)} disabled={!chosenReady.length}>
            <PackageCheck size={16} />รับเข้าที่เลือก{chosenReady.length ? ` (${chosenReady.length})` : ''}
          </button>
        </ActionBar>
      )}

      {receiveOpen && (
        <ReceiveDialog rows={chosenReady} skipped={chosen.length - chosenReady.length} onClose={() => setReceiveOpen(false)}
          onDone={(doc) => { toast.success(`บันทึกใบรับเข้า ${doc.doc_no} แล้ว — อัปเดตสต็อกเรียบร้อย`); navigate(`/documents/${doc.id}`); }} />
      )}
      {deleting && (
        <Confirm title="ลบรายการรอรับเข้า" danger confirmLabel={`ลบ ${deleting.length} รายการ`}
          message={deleting.length === 1
            ? `ลบ “${deleting[0].item_name || deleting[0].name || deleting[0].sku || `แถว ${deleting[0].line_no ?? ''}`}” ออกจากรายการ — สต็อกไม่เปลี่ยน`
            : `ลบ ${deleting.length} รายการที่เลือกออกจากรายการ — สต็อกไม่เปลี่ยน`}
          onConfirm={remove} onClose={() => setDeleting(null)} />
      )}
      {creating && (
        <NewItemDialog line={creating} onClose={() => setCreating(null)}
          onDone={(item) => { setCreating(null); toast.success(`สร้าง “${item.name}” แล้ว — รายการพร้อมรับเข้า`); load(); }} />
      )}
      {cancelOpen && (
        <Confirm title="ยกเลิกรายการรอรับเข้า" danger confirmLabel={`ยกเลิก ${chosen.length} รายการ`}
          message="รายการที่ยกเลิกจะไม่ถูกรับเข้า (ดูย้อนหลังได้ที่แท็บ “ยกเลิก”) — สต็อกไม่เปลี่ยน"
          onConfirm={cancel} onClose={() => setCancelOpen(false)} />
      )}
    </>
  );
}

function ReceiveDialog({ rows, skipped, onClose, onDone }) {
  const toast = useToast();
  const vendors = useLookup('vendors');
  const locs = useLookup('locations');
  const po = rows.length && rows.every((r) => r.po_id && r.po_id === rows[0].po_id) ? rows[0] : null;
  const [head, setHead] = useState({ doc_date: todayISO(), vendor_id: po ? String(po.po_vendor_id) : '', location_id: '', po_number: po?.po_no || '', invoice_number: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState({});
  const set = (k) => (v) => { setHead((h) => ({ ...h, [k]: v?.target ? v.target.value : v })); setErr((e) => ({ ...e, [k]: null })); };
  const units = useMemo(() => rows.reduce((s, r) => s + r.qty, 0), [rows]);
  const value = useMemo(() => rows.reduce((s, r) => s + r.qty * (Number(r.unit_cost ?? r.item_unit_cost) || 0), 0), [rows]);

  const submit = async () => {
    if (!head.doc_date) { setErr({ doc_date: 'กรุณาระบุวันที่รับเข้า' }); return; }
    if (head.doc_date > todayISO()) { setErr({ doc_date: 'วันที่รับเข้าต้องไม่เป็นวันในอนาคต' }); return; }
    setBusy(true);
    try {
      onDone(await api.post('/api/pending-receipts/receive', { ...head, ids: rows.map((r) => r.id) }));
    } catch (e) { toast.error(e); setBusy(false); }
  };

  return (
    <Modal title={`รับเข้า ${rows.length} รายการ`} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>ยกเลิก</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกรับเข้า'}</button>
      </>}>
      <div className="stack" style={{ gap: 12 }}>
        <p className="field-hint">
          รวม <strong className="mono">{fmtNum(units)}</strong> หน่วย · มูลค่า <strong className="mono">{fmtMoney(value)}</strong> — ระบบจะออกใบรับเข้า (RCV) และเพิ่มสต็อกทันที
          {skipped > 0 && ` · ข้าม ${skipped} รายการที่ยังไม่พร้อม (ยังรออยู่ในรายการ)`}
        </p>
        <div className="form-grid">
          <Field label="วันที่รับเข้า" required error={err.doc_date} hint="เลือกย้อนหลังได้ หากของมาถึงก่อนวันนี้">
            <input type="date" className="input" value={head.doc_date} max={todayISO()} onChange={set('doc_date')} />
          </Field>
          <Field label="เก็บเข้าสถานที่"><Select value={head.location_id} onChange={set('location_id')} options={locs.map((l) => ({ value: l.id, label: l.name }))} /></Field>
          <Field label="ผู้ขาย (Vendor)"><Select value={head.vendor_id} onChange={set('vendor_id')} options={vendors.map((v) => ({ value: v.id, label: v.name }))} /></Field>
          <Field label="เลข PO"><input className="input mono" value={head.po_number} onChange={set('po_number')} /></Field>
          <Field label="เลขใบแจ้งหนี้ / ใบส่งของ"><input className="input mono" value={head.invoice_number} onChange={set('invoice_number')} /></Field>
          <Field label="หมายเหตุ" hint="เว้นว่าง = ใส่ชื่อไฟล์ให้อัตโนมัติ"><input className="input" value={head.note} onChange={set('note')} /></Field>
        </div>
      </div>
    </Modal>
  );
}

// Create the missing consumable right here (stock starts at 0); the pending line then matches it by SKU.
function NewItemDialog({ line, onClose, onDone }) {
  const toast = useToast();
  const cats = useLookup('categories', { kind: 'consumable' });
  const [v, setV] = useState({ name: line.name || '', category_id: '', unit: 'ชิ้น', reorder_point: '0', unit_cost: line.unit_cost ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState({});
  const set = (k) => (e) => { setV((x) => ({ ...x, [k]: e?.target ? e.target.value : e })); setErr((x) => ({ ...x, [k]: null })); };

  const submit = async () => {
    const e = {};
    if (!v.name.trim()) e.name = 'กรุณากรอกชื่อรายการ';
    if (!v.category_id) e.category_id = 'กรุณาเลือกหมวดหมู่';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      onDone(await api.post('/api/consumables', { ...v, sku: line.sku, unit_cost: v.unit_cost === '' ? null : v.unit_cost, qty_on_hand: 0 }));
    } catch (e) { toast.error(e); setBusy(false); }
  };

  return (
    <Modal title="สร้างรายการใหม่" onClose={onClose}
      footer={<>
        <Link to={newItemUrl(line)} className="btn btn-ghost">เปิดฟอร์มเต็ม</Link>
        <span className="spacer" />
        <button className="btn" onClick={onClose} disabled={busy}>ยกเลิก</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'กำลังบันทึก…' : 'สร้างรายการ'}</button>
      </>}>
      <div className="stack" style={{ gap: 12 }}>
        <p className="field-hint">วัสดุสิ้นเปลือง บาร์โค้ด <strong className="mono">{line.sku}</strong> · สต็อกเริ่มต้น 0 — จำนวน {fmtNum(line.qty)} จะเข้าสต็อกเมื่อกด “รับเข้า”</p>
        <div className="form-grid">
          <Field label="ชื่อรายการ" required error={err.name}><input className="input" value={v.name} onChange={set('name')} maxLength={300} /></Field>
          <Field label="หมวดหมู่" required error={err.category_id}>
            <Select value={v.category_id} onChange={set('category_id')} options={cats.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="หน่วยนับ"><input className="input" value={v.unit} onChange={set('unit')} /></Field>
          <Field label="จุดสั่งซื้อ" hint="แจ้งเตือนเมื่อคงเหลือถึงจำนวนนี้">
            <input type="number" min="0" inputMode="numeric" className="input mono" value={v.reorder_point} onChange={set('reorder_point')} />
          </Field>
          <Field label="ราคา/หน่วย"><input type="number" min="0" step="0.01" inputMode="decimal" className="input mono" value={v.unit_cost} onChange={set('unit_cost')} /></Field>
        </div>
      </div>
    </Modal>
  );
}
