import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Package, Laptop, Ban, ClipboardList, PackageCheck, FileText } from 'lucide-react';
import { useApi } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import Photo from '../components/Photo.jsx';
import { PageHeader, Card, Loading, Empty, Modal, Field, Confirm, Chip } from '../components/ui.jsx';
import { OrderChip } from './Orders.jsx';
import { fmtDateTime, fmtMoney, fmtNum } from '../format.js';

// รายการสั่งซื้อ: pending → approve (lines wait for a ใบสั่งซื้อ, then รอรับเข้า) / reject → handover on /issue?order= once received.
export default function OrderDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, reload } = useApi(`/api/orders/${id}`);
  const [qty, setQty] = useState({});
  const [picked, setPicked] = useState(new Set());
  const [reviewNote, setReviewNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    if (!data) return;
    setQty(Object.fromEntries(data.lines.map((l) => [l.id, String(l.approved_qty ?? l.qty)])));
    setPicked(new Set(data.lines.map((l) => l.id)));
  }, [data]);

  if (loading && !data) return <Card><Loading rows={8} /></Card>;
  if (!data) return <Empty title="ไม่พบรายการสั่งซื้อ"><Link to="/orders">กลับไปหน้ารายการสั่งซื้อ</Link></Empty>;
  const { order: o, lines } = data;
  const manage = can('order.manage');
  const reviewing = manage && o.status === 'pending';
  const received = lines.some((l) => l.receipt_status === 'received');
  const canCancel = o.status === 'pending' || (manage && o.status === 'approved' && !received);
  const canHandover = manage && o.status === 'approved' && received && !o.awaiting_lines && (can('consumable.move') || can('asset.transact'));
  const needsPo = manage && o.status === 'approved' && lines.some((l) => l.receipt_status === 'pending' && !l.po_id);
  const toReceive = o.status === 'approved' && can('consumable.view') && lines.some((l) => l.receipt_status === 'pending' && l.po_id);
  const approvedQty = (l) => (picked.has(l.id) ? parseInt(qty[l.id], 10) || 0 : 0);
  const approveTotal = lines.reduce((s, l) => s + approvedQty(l), 0);
  const allPicked = lines.length > 0 && lines.every((l) => picked.has(l.id));
  const toggle = (lid) => setPicked((p) => { const n = new Set(p); if (n.has(lid)) n.delete(lid); else n.add(lid); return n; });
  const showApproved = o.status !== 'pending';
  const tracked = lines.some((l) => l.receipt_status);
  const value = lines.reduce((s, l) => s + (showApproved ? l.approved_qty || 0 : l.qty) * (Number(l.unit_price) || 0), 0);
  const docLink = (lid, no) => (can('asset.view') || can('consumable.view') ? <Link to={`/documents/${lid}`} className="mono">{no}</Link> : <span className="mono">{no}</span>);

  const act = async (path, body, msg, next) => {
    setBusy(true);
    try {
      await api.post(`/api/orders/${o.id}/${path}`, body);
      toast.success(msg);
      setDialog(null);
      if (next) navigate(next); else reload();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  const approve = () => act('approve', {
    review_note: reviewNote, lines: lines.map((l) => ({ id: l.id, approved_qty: approvedQty(l) })),
  }, `อนุมัติ ${o.order_no} แล้ว — เลือกรายการไปออกใบสั่งซื้อได้ที่แท็บ “รอออกใบสั่งซื้อ”`, '/orders');

  const receiptChip = (l) => {
    if (l.receipt_status === 'received') return <div className="stack" style={{ gap: 2, alignItems: 'flex-start' }}><Chip tone="success">รับเข้าแล้ว</Chip>{l.receipt_doc_id && <span className="cell-sub">{docLink(l.receipt_doc_id, l.receipt_doc_no)}</span>}</div>;
    if (l.receipt_status === 'pending' && !l.po_id) return <Chip tone="neutral">รอออกใบสั่งซื้อ</Chip>;
    if (l.receipt_status === 'pending') return <div className="stack" style={{ gap: 2, alignItems: 'flex-start' }}><Chip tone="warning">รอรับเข้า</Chip>{l.po_no && <span className="cell-sub">{manage ? <Link to={`/purchase-orders/${l.po_id}`} className="mono">{l.po_no}</Link> : <span className="mono">{l.po_no}</span>}</span>}</div>;
    if (l.receipt_status === 'cancelled') return <Chip tone="neutral">ยกเลิก</Chip>;
    return <span className="muted">—</span>;
  };

  return (
    <>
      <PageHeader title={`รายการสั่งซื้อ ${o.order_no}`} crumbs={[{ label: 'รายการสั่งซื้อ', to: '/orders' }, { label: o.order_no }]} />

      <div className="detail-grid">
        <Card title="รายการ" noBody>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {reviewing && (
                    <th style={{ width: 40 }}>
                      <input type="checkbox" className="check" checked={allPicked}
                        onChange={() => setPicked(allPicked ? new Set() : new Set(lines.map((l) => l.id)))} aria-label="เลือกทุกรายการ" />
                    </th>
                  )}
                  <th>สินค้า</th>
                  <th className="text-right">สั่ง</th>
                  {reviewing && <th className="text-right">คงเหลือในสต็อก</th>}
                  {(reviewing || showApproved) && <th className="text-right">อนุมัติ</th>}
                  <th className="text-right">ราคา/หน่วย</th>
                  {tracked && <th>รับเข้า</th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const Icon = l.kind === 'asset' ? Laptop : Package;
                  const off = reviewing && !picked.has(l.id);
                  return (
                    <tr key={l.id}>
                      {reviewing && (
                        <td>
                          <input type="checkbox" className="check" checked={!off} onChange={() => toggle(l.id)} aria-label={`เลือก ${l.name}`} />
                        </td>
                      )}
                      <td style={off ? { opacity: 0.55 } : undefined}>
                        <div className="row" style={{ gap: 10 }}>
                          <Photo src={l.image_path} alt={l.name} icon={Icon} />
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
                          {off ? <span className="muted">ไม่อนุมัติ</span> : <input type="number" min="0" max={l.qty} inputMode="numeric" className="input mono" style={{ width: 84, textAlign: 'right' }}
                            value={qty[l.id] ?? ''} onChange={(e) => setQty((s) => ({ ...s, [l.id]: e.target.value }))} aria-label={`จำนวนอนุมัติ ${l.name}`} />}
                        </td>
                      ) : showApproved && (
                        <td className="text-right nowrap">{l.approved_qty == null ? '—' : l.approved_qty === 0 ? <span className="muted">ไม่อนุมัติ</span> : <><span className="mono">{fmtNum(l.approved_qty)}</span> {l.unit}</>}</td>
                      )}
                      <td className="text-right mono">{fmtMoney(l.unit_price)}</td>
                      {tracked && <td>{receiptChip(l)}</td>}
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
                <span>ประมาณการตามราคาล่าสุด <strong className="mono">{fmtMoney(value)}</strong></span>
              </div>
            )}
            {reviewing && (
              <Field label="หมายเหตุถึงผู้สั่ง" hint="ไม่บังคับ — เช่น เหตุผลที่ไม่อนุมัติบางรายการหรือลดจำนวน · เฉพาะรายการที่เลือกจะไปรอออกใบสั่งซื้อ แล้วจึงรอรับของที่เมนู “รอรับเข้า”">
                <input className="input" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} maxLength={500} />
              </Field>
            )}
          </div>
        </Card>

        <Card title="ข้อมูล"
          foot={(reviewing || needsPo || canCancel || toReceive || canHandover) && (
            <div className="card-actions">
              {reviewing && <button className="btn btn-primary" onClick={approve} disabled={busy || !approveTotal}><CheckCircle2 size={16} />{allPicked ? 'อนุมัติ' : 'อนุมัติที่เลือก'} · {fmtNum(approveTotal)} หน่วย</button>}
              {canHandover && <Link to={`/issue?order=${o.id}`} className="btn btn-primary"><PackageCheck size={16} />ส่งมอบให้ผู้สั่ง</Link>}
              {reviewing && <button className="btn" onClick={() => setDialog('reject')} disabled={busy}><XCircle size={16} />ไม่อนุมัติ</button>}
              {needsPo && <Link to={`/purchase-orders/new?order=${o.id}`} className="btn"><FileText size={16} />สร้างใบสั่งซื้อ</Link>}
              {toReceive && <Link to="/pending-receive" className="btn"><ClipboardList size={16} />ไปที่รอรับเข้า</Link>}
              {canCancel && <button className="btn btn-danger" onClick={() => setDialog('cancel')} disabled={busy}><Ban size={16} />ยกเลิกรายการสั่งซื้อ</button>}
            </div>
          )}>
          <dl className="dl">
            <dt>สถานะ</dt><dd><OrderChip status={o.status} /></dd>
            <dt>ผู้รับ</dt><dd>{o.person_name || 'ทั้งแผนก (ไม่ระบุชื่อ)'}</dd>
            <dt>แผนก</dt><dd>{o.department_name || '—'}</dd>
            {o.note && <><dt>หมายเหตุ</dt><dd>{o.note}</dd></>}
            <dt>สั่งซื้อ</dt><dd>{fmtDateTime(o.created_at)}<div className="cell-sub">{o.requested_by_name}</div></dd>
            {o.reviewed_at && <>
              <dt>{o.status === 'rejected' ? 'ไม่อนุมัติ' : 'อนุมัติ'}</dt>
              <dd>{fmtDateTime(o.reviewed_at)}<div className="cell-sub">{o.reviewed_by_name}</div></dd>
            </>}
            {o.review_note && <><dt>เหตุผล / หมายเหตุ</dt><dd>{o.review_note}</dd></>}
            {o.delivered_at && <>
              <dt>ส่งมอบ</dt>
              <dd>{fmtDateTime(o.delivered_at)}<div className="cell-sub">{o.delivered_by_name}{o.handover_doc_no && <> · {docLink(o.doc_id, o.handover_doc_no)}</>}</div></dd>
            </>}
            {o.cancelled_at && <><dt>ยกเลิก</dt><dd>{fmtDateTime(o.cancelled_at)}</dd></>}
          </dl>
        </Card>
      </div>

      {dialog === 'reject' && <RejectDialog busy={busy} onClose={() => setDialog(null)}
        onSubmit={(note) => act('reject', { review_note: note }, `ไม่อนุมัติ ${o.order_no} แล้ว`)} />}
      {dialog === 'cancel' && (
        <Confirm title="ยกเลิกรายการสั่งซื้อ" danger confirmLabel="ยกเลิกรายการสั่งซื้อ"
          message={`ยกเลิก ${o.order_no}${o.status === 'approved' ? ' — รายการที่รอรับเข้าจะถูกยกเลิกด้วย' : ''} · สต็อกไม่เปลี่ยน`}
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
    <Modal title="ไม่อนุมัติรายการสั่งซื้อ" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>ยกเลิก</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'กำลังบันทึก…' : 'ไม่อนุมัติ'}</button>
      </>}>
      <Field label="เหตุผล" required hint="ผู้สั่งจะเห็นข้อความนี้ในรายการสั่งซื้อ">
        <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </Field>
    </Modal>
  );
}
