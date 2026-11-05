import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, PackageCheck, PackagePlus, Package, Laptop, Ban } from 'lucide-react';
import { useApi, useLookup } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Loading, Empty, Modal, Field, Select, Confirm } from '../components/ui.jsx';
import { OrderChip } from './Orders.jsx';
import { fmtDateTime, fmtMoney, fmtNum, todayISO } from '../format.js';

const DocLink = ({ id, no, can }) => (can('asset.view') || can('consumable.view')
  ? <Link to={`/documents/${id}`} className="mono">{no}</Link> : <span className="mono">{no}</span>);

// ใบสั่งซื้อ: pending → approve/reject → รับของ (RCV slip) → ส่งมอบ (ISS slip).
export default function OrderDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useApi(`/api/orders/${id}`);
  const [qty, setQty] = useState({});
  const [reviewNote, setReviewNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    if (data) setQty(Object.fromEntries(data.lines.map((l) => [l.id, String(l.approved_qty ?? l.qty)])));
  }, [data]);

  if (loading && !data) return <Card><Loading rows={8} /></Card>;
  if (!data) return <Empty title="ไม่พบใบสั่งซื้อ"><Link to="/orders">กลับไปหน้าใบสั่งซื้อ</Link></Empty>;
  const { order: o, lines } = data;
  const manage = can('order.manage');
  const reviewing = manage && o.stage === 'pending';
  const canCancel = o.stage === 'pending' || (manage && o.stage === 'approved');
  const approveTotal = lines.reduce((s, l) => s + (parseInt(qty[l.id], 10) || 0), 0);
  const showApproved = o.stage !== 'pending';
  const value = lines.reduce((s, l) => s + (showApproved ? l.approved_qty || 0 : l.qty) * (Number(l.unit_price) || 0), 0);

  const act = async (path, body, msg) => {
    setBusy(true);
    try {
      const r = await api.post(`/api/orders/${o.id}/${path}`, body);
      toast.success(typeof msg === 'function' ? msg(r) : msg);
      setDialog(null);
      reload();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  const approve = () => act('approve', {
    review_note: reviewNote, lines: lines.map((l) => ({ id: l.id, approved_qty: parseInt(qty[l.id], 10) || 0 })),
  }, `อนุมัติ ${o.order_no} แล้ว — รอรับของ`);

  return (
    <>
      <PageHeader title={`ใบสั่งซื้อ ${o.order_no}`} crumbs={[{ label: 'ใบสั่งซื้อ', to: '/orders' }, { label: o.order_no }]}>
        {canCancel && <button className="btn btn-ghost" onClick={() => setDialog('cancel')} disabled={busy}><Ban size={16} />ยกเลิกใบสั่งซื้อ</button>}
        {reviewing && <button className="btn" onClick={() => setDialog('reject')} disabled={busy}><XCircle size={16} />ไม่อนุมัติ</button>}
        {reviewing && (
          <button className="btn btn-primary" onClick={approve} disabled={busy || !approveTotal}><CheckCircle2 size={16} />อนุมัติ · {fmtNum(approveTotal)} หน่วย</button>
        )}
        {manage && o.stage === 'approved' && (
          <button className="btn btn-primary" onClick={() => setDialog('receive')} disabled={busy}><PackagePlus size={16} />รับของ</button>
        )}
        {manage && o.stage === 'received' && (
          <button className="btn btn-primary" onClick={() => setDialog('deliver')} disabled={busy}><PackageCheck size={16} />ส่งมอบ</button>
        )}
      </PageHeader>

      <div className="detail-grid">
        <Card title="รายการ" noBody>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>สินค้า</th>
                  <th className="text-right">สั่ง</th>
                  {reviewing && <th className="text-right">คงเหลือในสต็อก</th>}
                  {(reviewing || showApproved) && <th className="text-right">อนุมัติ</th>}
                  <th className="text-right">ราคา/หน่วย</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const Icon = l.kind === 'asset' ? Laptop : Package;
                  return (
                    <tr key={l.id}>
                      <td>
                        <div className="row" style={{ gap: 10 }}>
                          <span className="thumb">{l.image_path ? <img src={l.image_path} alt="" loading="lazy" /> : <Icon size={16} />}</span>
                          <div style={{ minWidth: 0 }}>
                            <div className="cell-main">{l.name}</div>
                            <div className="cell-sub">{[l.category_name, l.brand, l.model].filter(Boolean).join(' · ')}{l.code && <> · <span className="mono">{l.code}</span></>}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-right nowrap"><span className="mono">{fmtNum(l.qty)}</span> {l.unit}</td>
                      {reviewing && <td className="text-right nowrap"><span className="mono">{fmtNum(l.on_hand)}</span> {l.unit}</td>}
                      {reviewing ? (
                        <td className="text-right">
                          <input type="number" min="0" max={l.qty} inputMode="numeric" className="input mono" style={{ width: 84, textAlign: 'right' }}
                            value={qty[l.id] ?? ''} onChange={(e) => setQty((s) => ({ ...s, [l.id]: e.target.value }))} aria-label={`จำนวนอนุมัติ ${l.name}`} />
                        </td>
                      ) : showApproved && (
                        <td className="text-right nowrap">{l.approved_qty == null ? '—' : <><span className="mono">{fmtNum(l.approved_qty)}</span> {l.unit}</>}</td>
                      )}
                      <td className="text-right mono">{fmtMoney(l.unit_price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="card-body stack" style={{ gap: 12 }}>
            {value > 0 && (
              <div className="line-summary" style={{ marginTop: 0 }}>
                <span className="spacer" />
                <span>{o.receive_doc_id ? 'มูลค่าตามใบรับเข้า' : 'ประมาณการตามราคาล่าสุด'} <strong className="mono">{fmtMoney(value)}</strong></span>
              </div>
            )}
            {reviewing && (
              <Field label="หมายเหตุถึงผู้สั่ง" hint="ไม่บังคับ — เช่น เหตุผลที่ลดจำนวน">
                <input className="input" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} maxLength={500} />
              </Field>
            )}
          </div>
        </Card>

        <Card title="ข้อมูล">
          <dl className="dl">
            <dt>สถานะ</dt><dd><OrderChip status={o.stage} /></dd>
            <dt>ผู้รับ</dt><dd>{o.person_name || 'ทั้งแผนก (ไม่ระบุชื่อ)'}</dd>
            <dt>แผนก</dt><dd>{o.department_name || '—'}</dd>
            {o.note && <><dt>หมายเหตุ</dt><dd>{o.note}</dd></>}
            <dt>สั่งซื้อ</dt><dd>{fmtDateTime(o.created_at)}<div className="cell-sub">{o.requested_by_name}</div></dd>
            {o.reviewed_at && <>
              <dt>{o.status === 'rejected' ? 'ไม่อนุมัติ' : 'อนุมัติ'}</dt>
              <dd>{fmtDateTime(o.reviewed_at)}<div className="cell-sub">{o.reviewed_by_name}</div></dd>
            </>}
            {o.review_note && <><dt>เหตุผล / หมายเหตุ</dt><dd>{o.review_note}</dd></>}
            {o.received_at && <>
              <dt>รับของ</dt>
              <dd>{fmtDateTime(o.received_at)}<div className="cell-sub">{o.received_by_name}</div></dd>
              <dt>ใบรับเข้า</dt><dd><DocLink id={o.receive_doc_id} no={o.receive_doc_no} can={can} /></dd>
            </>}
            {o.delivered_at && <>
              <dt>ส่งมอบ</dt>
              <dd>{fmtDateTime(o.delivered_at)}<div className="cell-sub">{o.delivered_by_name}</div></dd>
              <dt>ใบเบิก</dt><dd><DocLink id={o.doc_id} no={o.doc_no} can={can} /></dd>
            </>}
            {o.cancelled_at && <><dt>ยกเลิก</dt><dd>{fmtDateTime(o.cancelled_at)}</dd></>}
          </dl>
        </Card>
      </div>

      {dialog === 'reject' && <RejectDialog busy={busy} onClose={() => setDialog(null)}
        onSubmit={(note) => act('reject', { review_note: note }, `ไม่อนุมัติ ${o.order_no} แล้ว`)} />}
      {dialog === 'receive' && <ReceiveDialog order={o} lines={lines.filter((l) => l.approved_qty > 0)} busy={busy} onClose={() => setDialog(null)}
        onSubmit={(body) => act('receive', body, (doc) => `รับของแล้ว — ออกใบรับเข้า ${doc.doc_no} และเพิ่มสต็อกเรียบร้อย`)} />}
      {dialog === 'deliver' && <DeliverDialog order={o} lines={lines} busy={busy} onClose={() => setDialog(null)}
        onSubmit={(body) => act('deliver', body, (doc) => `ส่งมอบแล้ว — ออกใบเบิก ${doc.doc_no} และตัดสต็อกเรียบร้อย`)} />}
      {dialog === 'cancel' && (
        <Confirm title="ยกเลิกใบสั่งซื้อ" danger confirmLabel="ยกเลิกใบสั่งซื้อ"
          message={`ยกเลิก ${o.order_no} — ยังไม่มีการรับของ สต็อกไม่เปลี่ยน`}
          onConfirm={() => act('cancel', {}, `ยกเลิก ${o.order_no} แล้ว`)} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

function RejectDialog({ busy, onClose, onSubmit }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const submit = () => (note.trim() ? onSubmit(note.trim()) : toast.error('กรุณาระบุเหตุผลที่ไม่อนุมัติ'));
  return (
    <Modal title="ไม่อนุมัติใบสั่งซื้อ" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>ยกเลิก</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'กำลังบันทึก…' : 'ไม่อนุมัติ'}</button>
      </>}>
      <Field label="เหตุผล" required hint="ผู้สั่งจะเห็นข้อความนี้ในใบสั่งซื้อ">
        <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </Field>
    </Modal>
  );
}

function ReceiveDialog({ order, lines, busy, onClose, onSubmit }) {
  const toast = useToast();
  const vendors = useLookup('vendors');
  const locs = useLookup('locations');
  const [head, setHead] = useState({ doc_date: todayISO(), purchase_date: '', vendor_id: '', location_id: '', po_number: order.order_no, invoice_number: '', note: '' });
  const [prices, setPrices] = useState(() => Object.fromEntries(lines.map((l) => [l.id, l.unit_price ?? ''])));
  const set = (k) => (v) => setHead((h) => ({ ...h, [k]: v?.target ? v.target.value : v }));
  const total = lines.reduce((s, l) => s + l.approved_qty * (Number(prices[l.id]) || 0), 0);

  const submit = () => {
    if (!head.doc_date || head.doc_date > todayISO()) { toast.error('วันที่รับเข้าต้องไม่เป็นวันในอนาคต'); return; }
    if (head.purchase_date && head.purchase_date > head.doc_date) { toast.error('วันที่ซื้อต้องไม่หลังวันที่รับเข้า'); return; }
    onSubmit({ ...head, lines: lines.map((l) => ({ id: l.id, unit_price: prices[l.id] })) });
  };

  return (
    <Modal title={`รับของ ${order.order_no}`} wide onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>ยกเลิก</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกรับของ'}</button>
      </>}>
      <div className="stack" style={{ gap: 12 }}>
        <p className="field-hint">ระบบจะออกใบรับเข้า (RCV) ตามจำนวนที่อนุมัติ — วัสดุสิ้นเปลืองเพิ่มสต็อก, อุปกรณ์รายชิ้นสร้างเครื่องใหม่ (แก้ Serial ได้ที่หน้าอุปกรณ์ภายหลัง)</p>
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>สินค้า</th><th className="text-right">จำนวน</th><th className="text-right">ราคา/หน่วย</th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td><div className="cell-main">{l.name}</div><div className="cell-sub">{[l.brand, l.model].filter(Boolean).join(' · ')}</div></td>
                  <td className="text-right nowrap"><span className="mono">{fmtNum(l.approved_qty)}</span> {l.unit}</td>
                  <td className="text-right">
                    <input type="number" min="0" step="0.01" inputMode="decimal" className="input mono" style={{ width: 120, textAlign: 'right' }}
                      value={prices[l.id]} onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))} aria-label={`ราคาต่อหน่วย ${l.name}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="line-summary" style={{ marginTop: 0 }}><span className="spacer" /><span>มูลค่ารวม <strong className="mono">{fmtMoney(total)}</strong></span></div>
        <div className="form-grid">
          <Field label="วันที่รับเข้า" required hint="เลือกย้อนหลังได้ หากของมาถึงก่อนวันนี้">
            <input type="date" className="input" value={head.doc_date} max={todayISO()} onChange={set('doc_date')} />
          </Field>
          <Field label="วันที่ซื้อ" hint="เว้นว่าง = วันที่รับเข้า">
            <input type="date" className="input" value={head.purchase_date} max={head.doc_date} onChange={set('purchase_date')} />
          </Field>
          <Field label="ผู้ขาย (Vendor)"><Select value={head.vendor_id} onChange={set('vendor_id')} options={vendors.map((v) => ({ value: v.id, label: v.name }))} /></Field>
          <Field label="เก็บเข้าสถานที่"><Select value={head.location_id} onChange={set('location_id')} options={locs.map((x) => ({ value: x.id, label: x.name }))} /></Field>
          <Field label="เลข PO"><input className="input mono" value={head.po_number} onChange={set('po_number')} /></Field>
          <Field label="เลขใบแจ้งหนี้ / ใบส่งของ"><input className="input mono" value={head.invoice_number} onChange={set('invoice_number')} /></Field>
          <Field label="หมายเหตุ" className="span-2"><input className="input" value={head.note} onChange={set('note')} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function DeliverDialog({ order, lines, busy, onClose, onSubmit }) {
  const toast = useToast();
  const [docDate, setDocDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const units = lines.reduce((s, l) => s + (l.approved_qty || 0), 0);
  const submit = () => {
    if (!docDate || docDate > todayISO()) { toast.error('วันที่เบิกต้องไม่เป็นวันในอนาคต'); return; }
    onSubmit({ doc_date: docDate, note });
  };
  return (
    <Modal title={`ส่งมอบ ${order.order_no}`} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>ยกเลิก</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'กำลังบันทึก…' : 'ยืนยันส่งมอบ'}</button>
      </>}>
      <div className="stack" style={{ gap: 12 }}>
        <p className="field-hint">
          ส่งมอบ <strong className="mono">{fmtNum(units)}</strong> หน่วย ให้ {order.person_name || order.department_name} — ระบบจะออกใบเบิก (ISS) แบบเบิกถาวรและตัดสต็อก
          · อุปกรณ์รายชิ้นใช้เครื่องที่รับเข้าจากใบสั่งซื้อนี้
        </p>
        <div className="form-grid">
          <Field label="วันที่เบิก" required hint="ไม่ก่อนวันที่รับของ">
            <input type="date" className="input" value={docDate} max={todayISO()} onChange={(e) => setDocDate(e.target.value)} />
          </Field>
          <Field label="หมายเหตุในใบเบิก"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}
