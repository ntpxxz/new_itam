import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ReceiptText, ShoppingCart } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useQueryState, useDebounced } from '../hooks.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Empty, Loading, Chip, Tabs } from '../components/ui.jsx';
import { fmtDateTime, fmtNum, who } from '../format.js';

export const ORDER_STATUS = {
  pending: { label: 'รอตรวจสอบ', tone: 'warning' },
  approved: { label: 'อนุมัติแล้ว', tone: 'success' },
  delivered: { label: 'ส่งมอบแล้ว', tone: 'success' },
  rejected: { label: 'ไม่อนุมัติ', tone: 'danger' },
  cancelled: { label: 'ยกเลิก', tone: 'neutral' },
};

export const OrderChip = ({ status }) => <Chip tone={ORDER_STATUS[status]?.tone}>{ORDER_STATUS[status]?.label || status}</Chip>;

export default function Orders() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const manage = can('order.manage');
  const [f, setF] = useQueryState({ status: manage ? 'pending' : 'all', q: '' });
  const [q, setQ] = useState(f.q);
  const term = useDebounced(q);
  const [data, setData] = useState(null);

  useEffect(() => { if (term !== f.q) setF({ q: term }); }, [term]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setData(null);
    api.get('/api/orders', { status: f.status, q: f.q }).then(setData).catch((e) => toast.error(e));
  }, [f.status, f.q]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = data?.counts || {};
  const n = (k) => (counts[k] ? ` (${counts[k]})` : '');
  return (
    <>
      <PageHeader title="ใบสั่งซื้อ" sub={manage ? 'ตรวจสอบและอนุมัติ — รายการที่อนุมัติจะไปอยู่ที่เมนู “รอรับเข้า” เพื่อรับของเข้าสต็อก' : 'ใบสั่งซื้อของคุณและสถานะล่าสุด'}>
        {can('order.create') && <Link to="/shop" className="btn btn-primary"><ShoppingCart size={16} />สั่งซื้อสินค้า</Link>}
      </PageHeader>
      <Card noBody>
        <div className="toolbar">
          <Tabs value={f.status} onChange={(status) => setF({ status })} tabs={[
            { value: 'all', label: 'ทั้งหมด' },
            { value: 'pending', label: `รอตรวจสอบ${n('pending')}` },
            { value: 'approved', label: 'อนุมัติแล้ว' },
            { value: 'rejected', label: 'ไม่อนุมัติ' },
            { value: 'cancelled', label: 'ยกเลิก' },
          ]} />
          <div className="input-icon">
            <Search size={16} aria-hidden />
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขที่, ผู้รับ, แผนก" aria-label="ค้นหาใบสั่งซื้อ" />
          </div>
        </div>
        {!data ? <div className="card-body"><Loading /></div> : !data.rows.length ? (
          <div className="card-body">
            <Empty icon={ReceiptText} title="ไม่มีใบสั่งซื้อ">{can('order.create') ? 'กด “สั่งซื้อสินค้า” เพื่อเลือกของใส่ตะกร้า' : null}</Empty>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>เลขที่</th><th>ผู้รับ</th><th className="text-right">รายการ</th><th>สั่งเมื่อ</th><th>สถานะ</th></tr>
              </thead>
              <tbody>
                {data.rows.map((o) => (
                  <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
                    <td><Link to={`/orders/${o.id}`} className="cell-main mono" onClick={(e) => e.stopPropagation()}>{o.order_no}</Link></td>
                    <td>
                      <div className="cell-main">{who(o.person_name, o.department_name) || '—'}</div>
                      {o.person_name && o.department_name && <div className="cell-sub">{o.department_name}</div>}
                    </td>
                    <td className="text-right nowrap"><span className="mono">{fmtNum(o.line_count)}</span> รายการ · <span className="mono">{fmtNum(o.unit_count)}</span> หน่วย</td>
                    <td>
                      <div>{fmtDateTime(o.created_at)}</div>
                      <div className="cell-sub">{o.requested_by_name}</div>
                    </td>
                    <td>
                      <OrderChip status={o.status} />
                      {o.status === 'approved' && o.awaiting_lines > 0 && <div className="cell-sub">รอรับเข้า {o.awaiting_lines} รายการ</div>}
                    </td>
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
