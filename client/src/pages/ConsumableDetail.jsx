import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PackageMinus, PackagePlus, SlidersHorizontal, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { useApi } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Loading, Empty, Menu, Confirm } from '../components/ui.jsx';
import { MoveDialog } from '../components/ConsumableDialogs.jsx';
import { STOCK_META, ActionIcon } from '../components/actions.jsx';
import { fmtNum, fmtMoney, fmtDateTime, fmtDate, fmtMonth, who } from '../format.js';

export default function ConsumableDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, reload } = useApi(`/api/consumables/${id}`);
  const [move, setMove] = useState(null);
  const [del, setDel] = useState(false);

  if (loading && !data) return <Card><Loading rows={8} /></Card>;
  if (!data) return <Empty title="ไม่พบวัสดุ"><Link to="/consumables">กลับไปหน้ารายการ</Link></Empty>;
  const { item: x, movements, usage } = data;
  const maxUse = Math.max(1, ...usage.map((u) => u.qty));
  const totalOut = usage.reduce((a, u) => a + u.qty, 0);

  return (
    <>
      <PageHeader title={x.name} crumbs={[{ label: 'อุปกรณ์', to: '/assets' }, { label: x.category_name, to: `/assets?category_id=${x.category_id}` }, { label: x.sku }]}>
        <Menu buttonClass="icon-btn" items={[
          can('consumable.move') && { label: 'ปรับยอด (ตรวจนับ)', onClick: () => setMove('adjust'), icon: <SlidersHorizontal size={15} /> },
          can('consumable.manage') && { label: 'แก้ไขข้อมูล', to: `/consumables/${x.id}/edit`, icon: <Pencil size={15} /> },
          can('consumable.manage') && '-',
          can('consumable.manage') && { label: 'ลบรายการ', onClick: () => setDel(true), icon: <Trash2 size={15} />, danger: true },
        ]} />
        {can('consumable.move') && <button className="btn" onClick={() => setMove('in')}><PackagePlus size={16} />รับเข้า</button>}
        {can('consumable.move') && <button className="btn btn-primary" onClick={() => setMove('out')} disabled={x.qty_on_hand === 0}><PackageMinus size={16} />เบิก</button>}
      </PageHeader>

      {x.is_low ? (
        <div className="alert">
          <AlertTriangle size={18} />
          <strong>{x.qty_on_hand === 0 ? 'สต็อกหมดแล้ว' : 'ต่ำกว่าจุดสั่งซื้อ'}</strong>
          <span className="alert-detail">คงเหลือ {fmtNum(x.qty_on_hand)} {x.unit} · จุดสั่งซื้อ {fmtNum(x.reorder_point)} {x.unit}{x.vendor_name && ` · สั่งซื้อจาก ${x.vendor_name}`}</span>
        </div>
      ) : null}

      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="card kpi"><span className="kpi-label">คงเหลือ</span><span className="kpi-value">{fmtNum(x.qty_on_hand)} <span style={{ fontSize: 14 }} className="muted">{x.unit}</span></span></div>
        <div className="card kpi"><span className="kpi-label">จุดสั่งซื้อ</span><span className="kpi-value">{fmtNum(x.reorder_point)}</span></div>
        <div className="card kpi"><span className="kpi-label">เบิกออก 6 เดือน</span><span className="kpi-value">{fmtNum(totalOut)}</span><span className="kpi-trend">เฉลี่ย {fmtNum(Math.round(totalOut / 6))} {x.unit}/เดือน</span></div>
        <div className="card kpi"><span className="kpi-label">มูลค่าคงเหลือ</span><span className="kpi-value" style={{ fontSize: 22 }}>{fmtMoney((x.unit_cost || 0) * x.qty_on_hand)}</span></div>
      </div>

      <div className="detail-grid">
        <Card title="ความเคลื่อนไหว" noBody>
          {!movements.length ? <Empty title="ยังไม่มีรายการ" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>วันที่</th><th>รายการ</th><th className="text-right">จำนวน</th><th className="text-right">คงเหลือ</th><th>ผู้รับ / หมายเหตุ</th><th>ผู้ทำรายการ</th></tr></thead>
                <tbody>
                  {movements.map((m) => {
                    const meta = STOCK_META[m.type];
                    const sign = m.type === 'out' ? '−' : m.qty > 0 ? '+' : m.qty < 0 ? '−' : '';
                    return (
                      <tr key={m.id}>
                        <td className="nowrap">
                          {m.doc_date && m.type === 'out' ? <><div>เบิก {fmtDate(m.doc_date)}</div><div className="cell-sub">บันทึก {fmtDateTime(m.created_at)}</div></> : m.received_date ? <><div>รับเข้า {fmtDate(m.received_date)}</div><div className="cell-sub">บันทึก {fmtDateTime(m.created_at)}</div></> : <span className="muted">{fmtDateTime(m.created_at)}</span>}
                        </td>
                        <td><div className="row" style={{ gap: 8 }}><ActionIcon meta={meta} size={12} />{meta.label}</div></td>
                        <td className="text-right mono">{sign}{fmtNum(Math.abs(m.qty))}</td>
                        <td className="text-right mono">{fmtNum(m.balance_after)}</td>
                        <td>{(m.person_name || m.department_name) && <div>{who(m.person_name, m.department_name)}{m.person_name && <span className="cell-sub"> · {m.department_name || 'ไม่ระบุแผนก'}</span>}</div>}{m.note && <div className="cell-sub">{m.note}</div>}{m.doc_no && <Link to={`/documents/${m.doc_id}`} className="mono" style={{ fontSize: 12 }}>{m.doc_no}</Link>}</td>
                        <td className="muted">{m.performed_by_name}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="stack">
          <Card title="การเบิกรายเดือน">
            {!usage.length ? <p className="muted">ยังไม่มีการเบิกใน 6 เดือนที่ผ่านมา</p> : (
              <div className="bars" style={{ height: 140 }}>
                {usage.map((u) => (
                  <div className="bar-col" key={u.ym}>
                    <span className="bar-value">{fmtNum(u.qty)}</span>
                    <div className="bar-stack" style={{ height: `${(u.qty / maxUse) * 100}%` }}><span style={{ height: '100%' }} /></div>
                    <span className="bar-label">{fmtMonth(u.ym)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="ข้อมูล">
            <dl className="dl">
              <dt>SKU</dt><dd className="mono">{x.sku}</dd>
              <dt>หมวดหมู่</dt><dd>{x.category_name}</dd>
              <dt>ราคา/หน่วย</dt><dd className="mono">{fmtMoney(x.unit_cost)}</dd>
              <dt>สถานที่เก็บ</dt><dd>{x.location_name || '—'}</dd>
              <dt>ผู้ขาย</dt><dd>{x.vendor_name || '—'}</dd>
              <dt>หมายเหตุ</dt><dd>{x.notes || '—'}</dd>
            </dl>
          </Card>
        </div>
      </div>

      {move && <MoveDialog item={x} type={move} onClose={() => setMove(null)} onDone={() => { setMove(null); reload(); }} />}
      {del && (
        <Confirm title={`ลบ ${x.name}?`} danger confirmLabel="ลบรายการ" onClose={() => setDel(false)}
          message="รายการจะถูกซ่อนจากระบบ แต่ประวัติความเคลื่อนไหวยังถูกเก็บไว้"
          onConfirm={async () => { try { await api.del(`/api/consumables/${x.id}`); toast.success('ลบรายการแล้ว'); navigate('/assets'); } catch (e) { toast.error(e); throw e; } }} />
      )}
    </>
  );
}
