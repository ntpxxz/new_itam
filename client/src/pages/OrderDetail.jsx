import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, PackageCheck, Package, Laptop, Ban } from 'lucide-react';
import { useApi } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Loading, Empty, Modal, Field, Confirm } from '../components/ui.jsx';
import { OrderChip } from './Orders.jsx';
import { fmtDate, fmtDateTime, fmtNum, todayISO } from '../format.js';

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
    if (data) setQty(Object.fromEntries(data.lines.map((l) => [l.id, String(l.approved_qty ?? Math.min(l.qty, l.available))])));
  }, [data]);

  if (loading && !data) return <Card><Loading rows={8} /></Card>;
  if (!data) return <Empty title="ไม่พบคำสั่งเบิก"><Link to="/orders">กลับไปหน้าคำสั่งเบิก</Link></Empty>;
  const { order: o, lines } = data;
  const manage = can('order.manage');
  const reviewing = manage && o.status === 'pending';
  const canCancel = o.status === 'pending' || (manage && o.status === 'approved');
  const shownQty = (l) => (o.status === 'pending' ? null : l.approved_qty);
  const approveTotal = lines.reduce((s, l) => s + (parseInt(qty[l.id], 10) || 0), 0);

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
  }, `อนุมัติ ${o.order_no} แล้ว — รอส่งมอบ`);

  return (
    <>
      <PageHeader title={`คำสั่งเบิก ${o.order_no}`} crumbs={[{ label: 'คำสั่งเบิก', to: '/orders' }, { label: o.order_no }]}>
        {canCancel && <button className="btn btn-ghost" onClick={() => setDialog('cancel')} disabled={busy}><Ban size={16} />ยกเลิกคำสั่งเบิก</button>}
        {reviewing && <button className="btn" onClick={() => setDialog('reject')} disabled={busy}><XCircle size={16} />ไม่อนุมัติ</button>}
        {reviewing && (
          <button className="btn btn-primary" onClick={approve} disabled={busy || !approveTotal}><CheckCircle2 size={16} />อนุมัติ · {fmtNum(approveTotal)} หน่วย</button>
        )}
        {manage && o.status === 'approved' && (
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
                  <th className="text-right">ขอเบิก</th>
                  {reviewing && <th className="text-right">คงเหลือให้เบิก</th>}
                  {(reviewing || o.status !== 'pending') && <th className="text-right">อนุมัติ</th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const Icon = l.kind === 'asset' ? Laptop : Package;
                  const max = Math.min(l.qty, l.available);
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
                      {reviewing && (
                        <td className={`text-right nowrap${l.available < l.qty ? ' danger-text' : ''}`}><span className="mono">{fmtNum(l.available)}</span> {l.unit}</td>
                      )}
                      {reviewing ? (
                        <td className="text-right">
                          <input type="number" min="0" max={max} inputMode="numeric" className="input mono" style={{ width: 84, textAlign: 'right' }}
                            value={qty[l.id] ?? ''} onChange={(e) => setQty((s) => ({ ...s, [l.id]: e.target.value }))} aria-label={`จำนวนอนุมัติ ${l.name}`} />
                        </td>
                      ) : o.status !== 'pending' && (
                        <td className="text-right nowrap">{shownQty(l) == null ? '—' : <><span className="mono">{fmtNum(shownQty(l))}</span> {l.unit}</>}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {reviewing && (
            <div className="card-body">
              <Field label="หมายเหตุถึงผู้ขอ" hint="ไม่บังคับ — เช่น เหตุผลที่ลดจำนวน">
                <input className="input" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} maxLength={500} />
              </Field>
            </div>
          )}
        </Card>

        <Card title="ข้อมูล">
          <dl className="dl">
            <dt>สถานะ</dt><dd><OrderChip status={o.status} /></dd>
            <dt>ผู้รับ</dt><dd>{o.person_name || 'ทั้งแผนก (ไม่ระบุชื่อ)'}</dd>
            <dt>แผนก</dt><dd>{o.department_name || '—'}</dd>
            {o.note && <><dt>หมายเหตุ</dt><dd>{o.note}</dd></>}
            <dt>สั่งเบิก</dt><dd>{fmtDateTime(o.created_at)}<div className="cell-sub">{o.requested_by_name}</div></dd>
            {o.reviewed_at && <>
              <dt>{o.status === 'rejected' ? 'ไม่อนุมัติ' : 'อนุมัติ'}</dt>
              <dd>{fmtDateTime(o.reviewed_at)}<div className="cell-sub">{o.reviewed_by_name}</div></dd>
            </>}
            {o.review_note && <><dt>เหตุผล / หมายเหตุ</dt><dd>{o.review_note}</dd></>}
            {o.delivered_at && <>
              <dt>ส่งมอบ</dt>
              <dd>{fmtDateTime(o.delivered_at)}<div className="cell-sub">{o.delivered_by_name}</div></dd>
            </>}
            {o.doc_id && <><dt>ใบเบิก</dt><dd>{can('asset.view') || can('consumable.view')
              ? <Link to={`/documents/${o.doc_id}`} className="mono">{o.doc_no}</Link> : <span className="mono">{o.doc_no}</span>}</dd></>}
            {o.cancelled_at && <><dt>ยกเลิก</dt><dd>{fmtDateTime(o.cancelled_at)}</dd></>}
          </dl>
        </Card>
      </div>

      {dialog === 'reject' && <RejectDialog busy={busy} onClose={() => setDialog(null)}
        onSubmit={(note) => act('reject', { review_note: note }, `ไม่อนุมัติ ${o.order_no} แล้ว`)} />}
      {dialog === 'deliver' && <DeliverDialog order={o} lines={lines} busy={busy} onClose={() => setDialog(null)}
        onSubmit={(body) => act('deliver', body, (doc) => `ส่งมอบแล้ว — ออกใบเบิก ${doc.doc_no} และตัดสต็อกเรียบร้อย`)} />}
      {dialog === 'cancel' && (
        <Confirm title="ยกเลิกคำสั่งเบิก" danger confirmLabel="ยกเลิกคำสั่งเบิก"
          message={`ยกเลิก ${o.order_no} — ${o.status === 'approved' ? 'จำนวนที่จองไว้จะคืนให้เบิกได้อีก' : 'ผู้ดูแลจะไม่เห็นคำสั่งนี้ในรายการรอตรวจสอบ'} · สต็อกไม่เปลี่ยน`}
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
    <Modal title="ไม่อนุมัติคำสั่งเบิก" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>ยกเลิก</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'กำลังบันทึก…' : 'ไม่อนุมัติ'}</button>
      </>}>
      <Field label="เหตุผล" required hint="ผู้ขอจะเห็นข้อความนี้ในคำสั่งเบิก">
        <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </Field>
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
          ส่งมอบ <strong className="mono">{fmtNum(units)}</strong> หน่วย ให้ {order.person_name || order.department_name} — ระบบจะออกใบเบิก (ISS) แบบเบิกถาวรและตัดสต็อกทันที
          · อุปกรณ์รายชิ้นจะเลือกเครื่องที่รับเข้าก่อน
        </p>
        <div className="form-grid">
          <Field label="วันที่เบิก" required hint={`เลือกย้อนหลังได้ · อนุมัติเมื่อ ${fmtDate(order.reviewed_at)}`}>
            <input type="date" className="input" value={docDate} max={todayISO()} onChange={(e) => setDocDate(e.target.value)} />
          </Field>
          <Field label="หมายเหตุในใบเบิก"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}
