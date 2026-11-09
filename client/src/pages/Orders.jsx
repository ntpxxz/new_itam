import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ReceiptText, FilePlus2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useQueryState, useDebounced } from '../hooks.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Empty, Loading, Chip, Tabs } from '../components/ui.jsx';
import { fmtDateTime, fmtMoney, fmtNum, who } from '../format.js';

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
  const [avail, setAvail] = useState(null);
  const items = f.status === 'items' && manage;

  useEffect(() => { if (term !== f.q) setF({ q: term }); }, [term]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (items) return;
    setData(null);
    api.get('/api/orders', { status: f.status, q: f.q }).then(setData).catch((e) => toast.error(e));
  }, [f.status, f.q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (manage) api.get('/api/purchase-orders/available').then((d) => setAvail(d.rows)).catch((e) => toast.error(e));
  }, [manage, f.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = data?.counts || {};
  const n = (k) => (counts[k] ? ` (${counts[k]})` : '');
  return (
    <>
      <PageHeader title="รายการสั่งซื้อ" sub={manage ? 'อนุมัติ → ออกใบสั่งซื้อ (แท็บ “รอออกใบสั่งซื้อ”) → รับของที่เมนู “รอรับเข้า” → ส่งมอบให้ผู้สั่ง' : 'รายการสั่งซื้อของคุณและสถานะล่าสุด'} />
      <Card noBody>
        <div className="toolbar">
          <Tabs value={f.status} onChange={(status) => setF({ status })} tabs={[
            { value: 'all', label: 'ทั้งหมด' },
            { value: 'pending', label: `รอตรวจสอบ${n('pending')}` },
            { value: 'approved', label: 'อนุมัติแล้ว' },
            ...(manage ? [{ value: 'items', label: `รอออกใบสั่งซื้อ${avail?.length ? ` (${avail.length})` : ''}` }] : []),
            { value: 'rejected', label: 'ไม่อนุมัติ' },
            { value: 'cancelled', label: 'ยกเลิก' },
          ]} />
          <div className="input-icon">
            <Search size={16} aria-hidden />
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={items ? 'ค้นหาเลขที่, สินค้า, ผู้รับ' : 'ค้นหาเลขที่, ผู้รับ, แผนก'} aria-label="ค้นหารายการสั่งซื้อ" />
          </div>
        </div>
        {items ? <ApprovedItems rows={avail} q={q} /> : !data ? <div className="card-body"><Loading /></div> : !data.rows.length ? (
          <div className="card-body">
            <Empty icon={ReceiptText} title="ไม่มีรายการสั่งซื้อ">{can('order.create') ? <><Link to="/shop">ไปที่สั่งซื้อสินค้า</Link> เพื่อเลือกของใส่ตะกร้า</> : null}</Empty>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table cards">
              <thead>
                <tr><th>เลขที่</th><th>ผู้รับ</th><th className="text-right">รายการ</th><th>สั่งเมื่อ</th><th>สถานะ</th></tr>
              </thead>
              <tbody>
                {data.rows.map((o) => (
                  <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
                    <td className="cell-primary"><Link to={`/orders/${o.id}`} className="cell-main mono" onClick={(e) => e.stopPropagation()}>{o.order_no}</Link></td>
                    <td data-label="ผู้รับ">
                      <div className="cell-main">{who(o.person_name, o.department_name) || '—'}</div>
                      {o.person_name && o.department_name && <div className="cell-sub">{o.department_name}</div>}
                    </td>
                    <td className="text-right nowrap" data-label="รายการ"><span className="mono">{fmtNum(o.line_count)}</span> รายการ · <span className="mono">{fmtNum(o.unit_count)}</span> หน่วย</td>
                    <td data-label="สั่งเมื่อ">
                      <div>{fmtDateTime(o.created_at)}</div>
                      <div className="cell-sub">{o.requested_by_name}</div>
                    </td>
                    <td data-label="สถานะ">
                      <OrderChip status={o.status} />
                      {o.status === 'approved' && <div className="cell-sub">{o.awaiting_lines > 0 ? `รอรับเข้า ${o.awaiting_lines} รายการ` : 'รับเข้าครบ · รอส่งมอบ'}</div>}
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

// Approved lines from every รายการสั่งซื้อ that are not on a ใบสั่งซื้อ yet — tick them and continue to /purchase-orders/new.
function ApprovedItems({ rows, q }) {
  const navigate = useNavigate();
  const [picked, setPicked] = useState(new Set());
  if (!rows) return <div className="card-body"><Loading /></div>;
  if (!rows.length) return <div className="card-body"><Empty icon={FilePlus2} title="ไม่มีรายการรอออกใบสั่งซื้อ">รายการที่อนุมัติแล้วจะมารวมที่นี่ เพื่อเลือกออกใบสั่งซื้อ</Empty></div>;
  const term = q.trim().toLowerCase();
  const shown = rows.filter((r) => !term || [r.order_no, r.name, r.sku, r.person_name, r.department_name].some((v) => v && String(v).toLowerCase().includes(term)));
  const chosen = rows.filter((r) => picked.has(r.id));
  const allShown = shown.length > 0 && shown.every((r) => picked.has(r.id));
  const toggle = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleShown = () => setPicked((p) => { const n = new Set(p); for (const r of shown) { if (allShown) n.delete(r.id); else n.add(r.id); } return n; });
  const units = chosen.reduce((s, r) => s + r.qty, 0);
  const value = chosen.reduce((s, r) => s + r.qty * (Number(r.unit_cost) || 0), 0);
  return (
    <>
      <div className="table-wrap">
        <table className="table cards">
          <thead>
            <tr>
              <th style={{ width: 40 }}><input type="checkbox" className="check" checked={allShown} disabled={!shown.length} onChange={toggleShown} aria-label="เลือกทุกรายการที่แสดง" /></th>
              <th>สินค้า</th><th>รายการสั่งซื้อ</th><th className="text-right">จำนวน</th><th className="text-right">ราคา/หน่วย</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => toggle(r.id)}>
                <td className="cell-check"><input type="checkbox" className="check" checked={picked.has(r.id)} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()} aria-label={`เลือก ${r.name} จาก ${r.order_no}`} /></td>
                <td className="cell-primary">
                  <div className="cell-main">{r.name}</div>
                  <div className="cell-sub">{[r.category_name, r.brand, r.model].filter(Boolean).join(' · ')}{r.sku && <> · <span className="mono">{r.sku}</span></>}</div>
                </td>
                <td className="nowrap" data-label="รายการสั่งซื้อ">
                  <Link to={`/orders/${r.order_id}`} className="mono" onClick={(e) => e.stopPropagation()}>{r.order_no}</Link>
                  <div className="cell-sub">{who(r.person_name, r.department_name) || '—'}</div>
                </td>
                <td className="text-right nowrap" data-label="จำนวน"><span className="mono">{fmtNum(r.qty)}</span> {r.unit}</td>
                <td className="text-right mono" data-label="ราคา/หน่วย">{fmtMoney(r.unit_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-body">
        <div className="line-summary" style={{ marginTop: 0 }}>
          <span>เลือก <strong className="mono">{fmtNum(chosen.length)}</strong> รายการ · <strong className="mono">{fmtNum(units)}</strong> หน่วย{value > 0 && <> · ประมาณ <strong className="mono">{fmtMoney(value)}</strong></>}</span>
          <span className="spacer" />
          <button className="btn btn-primary" disabled={!chosen.length} onClick={() => navigate(`/purchase-orders/new?ids=${chosen.map((r) => r.id).join(',')}`)}>
            <FilePlus2 size={16} />สร้างใบสั่งซื้อ · {fmtNum(chosen.length)} รายการ
          </button>
        </div>
      </div>
    </>
  );
}
