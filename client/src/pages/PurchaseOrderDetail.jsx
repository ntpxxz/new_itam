import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Printer, Ban, ClipboardList } from 'lucide-react';
import { useApi } from '../hooks.js';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Loading, Empty, Chip, Confirm } from '../components/ui.jsx';
import { PoChip } from './PurchaseOrders.jsx';
import { fmtDate, fmtDateTime, fmtMoney, fmtNum, who } from '../format.js';

// Same item at the same price from several รายการสั่งซื้อ prints as one line for the vendor.
function groupForVendor(lines) {
  const map = new Map();
  for (const l of lines.filter((x) => x.status !== 'cancelled')) {
    const k = [l.kind, l.consumable_id || '', l.category_id || '', l.name, l.brand || '', l.model || '', l.unit_cost ?? ''].join('\u0001');
    const g = map.get(k);
    if (g) g.qty += l.qty;
    else map.set(k, { ...l, qty: l.qty });
  }
  return [...map.values()];
}

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data, loading, reload } = useApi(`/api/purchase-orders/${id}`);
  const [cancelling, setCancelling] = useState(false);
  if (loading && !data) return <Card><Loading rows={8} /></Card>;
  if (!data) return <Empty title="ไม่พบใบสั่งซื้อ"><Link to="/purchase-orders">กลับไปหน้าใบสั่งซื้อ</Link></Empty>;
  const { po: p, lines } = data;
  const items = groupForVendor(lines);
  const total = items.reduce((s, l) => s + l.qty * (Number(l.unit_cost) || 0), 0);

  const cancel = async () => {
    try {
      await api.post(`/api/purchase-orders/${p.id}/cancel`, {});
      toast.success(`ยกเลิก ${p.po_no} แล้ว — รายการกลับไปรอสร้างใบสั่งซื้อ`);
      setCancelling(false);
      reload();
    } catch (e) { toast.error(e); }
  };

  const receipt = (l) => {
    if (l.status === 'received') return <><Chip tone="success">รับเข้าแล้ว</Chip>{l.doc_id && <div className="cell-sub"><Link to={`/documents/${l.doc_id}`} className="mono">{l.doc_no}</Link></div>}</>;
    if (l.status === 'cancelled') return <Chip tone="neutral">ยกเลิก</Chip>;
    return <Chip tone="warning">รอรับเข้า</Chip>;
  };

  return (
    <>
      <PageHeader title={`ใบสั่งซื้อ ${p.po_no}`} crumbs={[{ label: 'ใบสั่งซื้อ', to: '/purchase-orders' }, { label: p.po_no }]} />

      {p.status === 'cancelled' ? (
        <Card>
          <Empty icon={Ban} title={`ใบสั่งซื้อ ${p.po_no} ถูกยกเลิก`}>
            ยกเลิกเมื่อ {fmtDateTime(p.cancelled_at)} โดย {p.cancelled_by_name} · รายการกลับไปรอสร้างใบสั่งซื้อใหม่ที่ <Link to="/purchase-orders/new">สร้างใบสั่งซื้อ</Link>
          </Empty>
        </Card>
      ) : (
        <div className="detail-grid">
        <div className="stack">
          <Card className="doc-sheet">
            <div className="doc-head">
              <div>
                <div className="l-org">IT Store · IT Asset Management</div>
                <h2 className="doc-title">ใบสั่งซื้อ (Purchase Order)</h2>
              </div>
              <dl className="dl doc-meta">
                <dt>เลขที่</dt><dd className="mono">{p.po_no}</dd>
                <dt>วันที่</dt><dd>{fmtDate(p.doc_date)}</dd>
                <dt className="no-print">สถานะ</dt><dd className="no-print"><PoChip state={p.state} /></dd>
              </dl>
            </div>

            <dl className="dl" style={{ margin: '16px 0' }}>
              <dt>ผู้ขาย</dt>
              <dd>
                <strong style={{ fontWeight: 600 }}>{p.vendor_name}</strong>
                {(p.vendor_contact || p.vendor_phone || p.vendor_email) && <div className="cell-sub">{[p.vendor_contact, p.vendor_phone, p.vendor_email].filter(Boolean).join(' · ')}</div>}
              </dd>
              {p.note && <><dt>หมายเหตุ</dt><dd>{p.note}</dd></>}
            </dl>

            <div className="table-wrap">
              <table className="table compact" style={{ minWidth: 560 }}>
                <thead>
                  <tr><th style={{ width: 40 }}>#</th><th>รายการ</th><th>รหัส</th><th className="text-right">จำนวน</th><th className="text-right">ราคา/หน่วย</th><th className="text-right">รวม</th></tr>
                </thead>
                <tbody>
                  {items.map((l, i) => (
                    <tr key={l.id}>
                      <td className="mono muted">{i + 1}</td>
                      <td>
                        <div className="cell-main">{l.name}</div>
                        <div className="cell-sub">{[l.category_name, l.brand, l.model].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="mono">{l.sku || '—'}</td>
                      <td className="text-right nowrap"><span className="mono">{fmtNum(l.qty)}</span> {l.unit}</td>
                      <td className="text-right mono">{fmtMoney(l.unit_cost)}</td>
                      <td className="text-right mono">{fmtMoney(l.qty * (Number(l.unit_cost) || 0))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={5} className="text-right" style={{ fontWeight: 600, padding: '12px 16px' }}>มูลค่ารวม</td><td className="text-right mono" style={{ fontWeight: 600, padding: '12px 16px' }}>{fmtMoney(total)}</td></tr>
                </tfoot>
              </table>
            </div>

            <div className="signatures">
              <div><div className="sig-line" />ผู้สั่งซื้อ<div className="cell-sub">{p.created_by_name}</div></div>
              <div><div className="sig-line" />ผู้อนุมัติ<div className="cell-sub">&nbsp;</div></div>
              <div><div className="sig-line" />ผู้ขาย<div className="cell-sub">{p.vendor_name}</div></div>
            </div>
            <p className="field-hint" style={{ marginTop: 16 }}>สร้างโดย {p.created_by_name} · {fmtDateTime(p.created_at)}</p>
          </Card>

          <Card title="ที่มาจากรายการสั่งซื้อ" noBody className="no-print">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>รายการสั่งซื้อ</th><th>สินค้า</th><th className="text-right">จำนวน</th><th>รับเข้า</th></tr></thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td className="nowrap"><Link to={`/orders/${l.order_id}`} className="mono">{l.order_no}</Link><div className="cell-sub">{who(l.person_name, l.department_name) || '—'}</div></td>
                      <td><div className="cell-main">{l.name}</div>{l.sku && <div className="tag">{l.sku}</div>}</td>
                      <td className="text-right nowrap"><span className="mono">{fmtNum(l.qty)}</span> {l.unit}</td>
                      <td>{receipt(l)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

          <Card title="ข้อมูล" className="no-print"
            foot={
              <div className="card-actions">
                <button className="btn btn-primary" onClick={() => window.print()}><Printer size={16} />พิมพ์ใบสั่งซื้อ</button>
                {p.waiting > 0 && <Link to={`/pending-receive?q=${encodeURIComponent(p.po_no)}`} className="btn"><ClipboardList size={16} />รับของที่รอรับเข้า</Link>}
                {p.state === 'open' && <button className="btn btn-danger" onClick={() => setCancelling(true)}><Ban size={16} />ยกเลิกใบสั่งซื้อ</button>}
              </div>
            }>
            <dl className="dl">
              <dt>สถานะ</dt><dd><PoChip state={p.state} />{p.waiting > 0 && p.received > 0 && <div className="cell-sub">รออีก {fmtNum(p.waiting)} รายการ</div>}</dd>
              <dt>ผู้ขาย</dt><dd>{p.vendor_name}</dd>
              <dt>รายการ</dt><dd><span className="mono">{fmtNum(p.line_count)}</span> รายการ · <span className="mono">{fmtNum(p.unit_count)}</span> หน่วย</dd>
              <dt>มูลค่ารวม</dt><dd className="mono">{fmtMoney(total)}</dd>
              <dt>สร้าง</dt><dd>{fmtDateTime(p.created_at)}<div className="cell-sub">{p.created_by_name}</div></dd>
            </dl>
          </Card>
        </div>
      )}

      {cancelling && (
        <Confirm title="ยกเลิกใบสั่งซื้อ" danger confirmLabel="ยกเลิกใบสั่งซื้อ"
          message={`ยกเลิก ${p.po_no} — รายการยังรอรับเข้าอยู่ และกลับไปเลือกสร้างใบสั่งซื้อใหม่ได้ · สต็อกไม่เปลี่ยน`}
          onConfirm={cancel} onClose={() => setCancelling(false)} />
      )}
    </>
  );
}
