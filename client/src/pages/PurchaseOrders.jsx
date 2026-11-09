import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, FileText, FilePlus2 } from 'lucide-react';
import { useApi, useQueryState, useDebounced } from '../hooks.js';
import { PageHeader, Card, Empty, Loading, Chip } from '../components/ui.jsx';
import { fmtDate, fmtMoney, fmtNum } from '../format.js';

export const PO_STATE = {
  open: { label: 'รอของ', tone: 'warning' },
  partial: { label: 'รับบางส่วน', tone: 'brand' },
  received: { label: 'รับครบแล้ว', tone: 'success' },
  cancelled: { label: 'ยกเลิก', tone: 'neutral' },
};
export const PoChip = ({ state }) => <Chip tone={PO_STATE[state]?.tone}>{PO_STATE[state]?.label || state}</Chip>;

// ใบสั่งซื้อ: lines picked from approved รายการสั่งซื้อ, ordered from one vendor, received later on รอรับเข้า.
export default function PurchaseOrders() {
  const navigate = useNavigate();
  const [f, setF] = useQueryState({ q: '' });
  const [q, setQ] = useState(f.q);
  const term = useDebounced(q);
  useEffect(() => { if (term !== f.q) setF({ q: term }); }, [term]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, loading } = useApi('/api/purchase-orders', { q: f.q });
  const { data: avail } = useApi('/api/purchase-orders/available');
  const waiting = avail?.rows.length || 0;

  return (
    <>
      <PageHeader title="ใบสั่งซื้อ" sub="เลือกสินค้าจากรายการสั่งซื้อที่อนุมัติแล้ว (รวมหลายใบได้) → สั่งผู้ขาย → รับของที่เมนู “รอรับเข้า”" />
      <Card noBody
        foot={
          <div className="line-summary" style={{ marginTop: 0 }}>
            <span className="muted">{waiting ? <>รอออกใบสั่งซื้อ <strong className="mono">{fmtNum(waiting)}</strong> รายการ</> : 'ไม่มีรายการรอออกใบสั่งซื้อ'}</span>
            <span className="spacer" />
            <Link to="/purchase-orders/new" className="btn btn-primary"><FilePlus2 size={16} />สร้างใบสั่งซื้อ</Link>
          </div>
        }>
        <div className="toolbar">
          <div className="input-icon">
            <Search size={16} aria-hidden />
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขที่ PO, ผู้ขาย" aria-label="ค้นหาใบสั่งซื้อ" />
          </div>
        </div>
        {loading && !data ? <div className="card-body"><Loading /></div> : !data?.rows.length ? (
          <div className="card-body">
            <Empty icon={FileText} title="ยังไม่มีใบสั่งซื้อ">{waiting ? <>มีรายการรอสั่ง {fmtNum(waiting)} รายการ — <Link to="/purchase-orders/new">สร้างใบสั่งซื้อ</Link></> : 'อนุมัติรายการสั่งซื้อก่อน แล้วเลือกรายการมาสร้างใบสั่งซื้อ'}</Empty>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>เลขที่</th><th>ผู้ขาย</th><th>วันที่</th><th className="text-right">รายการ</th><th className="text-right">มูลค่า</th><th>สถานะ</th></tr>
              </thead>
              <tbody>
                {data.rows.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/purchase-orders/${p.id}`)}>
                    <td><Link to={`/purchase-orders/${p.id}`} className="cell-main mono" onClick={(e) => e.stopPropagation()}>{p.po_no}</Link></td>
                    <td>{p.vendor_name}</td>
                    <td className="nowrap">{fmtDate(p.doc_date)}<div className="cell-sub">{p.created_by_name}</div></td>
                    <td className="text-right nowrap"><span className="mono">{fmtNum(p.line_count)}</span> รายการ · <span className="mono">{fmtNum(p.unit_count)}</span> หน่วย</td>
                    <td className="text-right mono">{fmtMoney(p.total)}</td>
                    <td><PoChip state={p.state} />{p.state === 'partial' && <div className="cell-sub">รออีก {fmtNum(p.waiting)} รายการ</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
