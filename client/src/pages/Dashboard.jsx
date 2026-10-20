import { Link } from 'react-router-dom';
import { Plus, AlertTriangle, ShieldAlert, PackageX, Archive, CalendarClock } from 'lucide-react';
import { useApi } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { PageHeader, Card, Loading, Empty, STATUS_DOT } from '../components/ui.jsx';
import ActivityFeed from '../components/ActivityFeed.jsx';
import { fmtDate, fmtNum, fmtMonth, fmtMoney, fmtMoneyShort, daysFromToday, who } from '../format.js';

function Kpi({ label, value, dot, trend, to }) {
  return (
    <Link to={to} className="card kpi">
      <span className="kpi-label"><span className="kpi-dot" style={{ background: dot }} aria-hidden />{label}</span>
      <span className="kpi-value">{fmtNum(value)}</span>
      {trend && <span className="kpi-trend">{trend}</span>}
    </Link>
  );
}

function SpendChart({ data }) {
  const max = Math.max(1, ...data.map((d) => d.assets + d.consumables));
  const total = data.reduce((a, d) => a + d.assets + d.consumables, 0);
  return (
    <Card title="ค่าใช้จ่ายซื้อเข้ารายเดือน" actions={<span className="mono muted" style={{ fontSize: 13 }}>รวม 6 เดือน {fmtMoney(total)}</span>}>
      <div className="bars" role="img" aria-label="กราฟค่าใช้จ่ายซื้อเข้า 6 เดือนล่าสุด">
        {data.map((d) => {
          const sum = d.assets + d.consumables;
          return (
            <div className="bar-col" key={d.month} title={`${fmtMonth(d.month)}: อุปกรณ์ ${fmtMoney(d.assets)} · วัสดุ ${fmtMoney(d.consumables)}`}>
              <span className="bar-value">{fmtMoneyShort(sum)}</span>
              <div className="bar-stack" style={{ height: `${(sum / max) * 100}%` }}>
                <span style={{ height: `${sum ? (d.assets / sum) * 100 : 0}%` }} />
                <span style={{ height: `${sum ? (d.consumables / sum) * 100 : 0}%` }} />
              </div>
              <span className="bar-label">{fmtMonth(d.month)}</span>
            </div>
          );
        })}
      </div>
      <div className="legend" style={{ marginTop: 12 }}>
        <span><i style={{ background: 'var(--brand)' }} />อุปกรณ์</span>
        <span><i style={{ background: 'var(--border-strong)' }} />วัสดุสิ้นเปลือง</span>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { can, user } = useAuth();
  const { data, loading } = useApi('/api/dashboard');

  if (loading && !data) return <><PageHeader title="ภาพรวม" /><Card><Loading rows={8} /></Card></>;
  if (!data) return null;
  const c = data.counts;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'สวัสดีตอนเช้า' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';

  return (
    <>
      <PageHeader title="ภาพรวม" sub={`${greet}, ${user.full_name.split(' ')[0]} · ${fmtDate(new Date())}`}>
        {can('asset.create') && <Link to="/assets/new" className="btn btn-primary"><Plus size={16} />เพิ่มอุปกรณ์</Link>}
      </PageHeader>

      <div className="kpi-row">
        <Kpi label="อุปกรณ์ทั้งหมด" value={data.total} dot="var(--text)" to="/assets" trend={`${data.byCategory.length} หมวดหมู่ · ไม่รวม Scrap`} />
        <Kpi label="พร้อมใช้" value={c.available || 0} dot={STATUS_DOT.available} to="/assets?status=available"
          trend={data.total ? `${Math.round(((c.available || 0) / data.total) * 100)}% ของทั้งหมด` : null} />
        <Kpi label="ถูกยืม" value={c.borrowed || 0} dot={STATUS_DOT.borrowed} to="/loans"
          trend={data.overdue.length ? <span className="danger-text">เกินกำหนด {data.overdue.length} รายการ</span> : 'ไม่มีรายการเกินกำหนด'} />
        <Kpi label="เบิกถาวร" value={c.issued || 0} dot={STATUS_DOT.issued} to="/assets?status=issued" trend="ใช้งานประจำโดยพนักงาน" />
        <Kpi label="กำลังซ่อม" value={c.repair || 0} dot={STATUS_DOT.repair} to="/assets?status=repair"
          trend={c.pending_disposal ? `รอจำหน่าย ${c.pending_disposal} รายการ` : 'ไม่มีรายการรอจำหน่าย'} />
      </div>

      {(data.overdue.length > 0 || data.warranty.length > 0 || data.lowStock.length > 0 || c.pending_disposal > 0 || data.dueSoon > 0) && (
        <div className="alerts">
          {data.overdue.length > 0 && (
            <div className="alert">
              <AlertTriangle size={18} aria-hidden />
              <strong>เกินกำหนดคืน {data.overdue.length} รายการ</strong>
              <span className="alert-detail">นานสุด {Math.abs(daysFromToday(data.overdue[0].due_date))} วัน — {data.overdue[0].name} ({who(data.overdue[0].holder_name, data.overdue[0].department_name)})</span>
              <Link to="/loans?filter=overdue">ดูทั้งหมด →</Link>
            </div>
          )}
          {data.dueSoon > 0 && (
            <div className="alert info">
              <CalendarClock size={18} aria-hidden />
              <strong>ครบกำหนดคืนภายใน 3 วัน {data.dueSoon} รายการ</strong>
              <span className="alert-detail">แจ้งเตือนผู้ยืมล่วงหน้าเพื่อให้คืนตรงเวลา</span>
              <Link to="/loans?filter=soon">ดูทั้งหมด →</Link>
            </div>
          )}
          {data.lowStock.length > 0 && can('consumable.view') && (
            <div className="alert">
              <PackageX size={18} aria-hidden />
              <strong>วัสดุสิ้นเปลืองต่ำกว่าจุดสั่งซื้อ {data.lowStock.length} รายการ</strong>
              <span className="alert-detail">{data.lowStock.slice(0, 3).map((x) => `${x.name} (เหลือ ${x.qty_on_hand})`).join(', ')}{data.lowStock.length > 3 ? ' …' : ''}</span>
              <Link to="/assets?status=low">ดูทั้งหมด →</Link>
            </div>
          )}
          {data.warranty.length > 0 && (
            <div className="alert">
              <ShieldAlert size={18} aria-hidden />
              <strong>ประกันจะหมดภายใน {data.warrantyDays} วัน {data.warranty.length} รายการ</strong>
              <span className="alert-detail">เร็วสุด {fmtDate(data.warranty[0].warranty_expiry)} — {data.warranty[0].name}</span>
              <Link to={`/assets?warranty=1&sort=warranty_expiry&dir=asc`}>ดูทั้งหมด →</Link>
            </div>
          )}
          {c.pending_disposal > 0 && can('asset.scrap') && (
            <div className="alert info">
              <Archive size={18} aria-hidden />
              <strong>รอจำหน่าย {c.pending_disposal} รายการ</strong>
              <span className="alert-detail">แนบหลักฐานการอนุมัติแล้วดำเนินการ Scrap</span>
              <Link to="/assets?status=pending_disposal">ดูทั้งหมด →</Link>
            </div>
          )}
        </div>
      )}

      <div className="two-col">
        <div className="stack">
          <Card title="เกินกำหนดคืน" noBody actions={<Link to="/loans" className="btn btn-ghost btn-sm">ไปหน้ายืม-คืน</Link>}>
            {data.overdue.length === 0 ? (
              <Empty title="ไม่มีอุปกรณ์เกินกำหนดคืน">ทุกรายการยืมยังอยู่ในกำหนด</Empty>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>อุปกรณ์</th><th>ผู้ยืม</th><th>กำหนดคืน</th><th className="text-right">เกินมา</th></tr></thead>
                  <tbody>
                    {data.overdue.slice(0, 8).map((a) => (
                      <tr key={a.id}>
                        <td><Link to={`/assets/${a.id}`} className="cell-main">{a.name}</Link><div className="tag">{a.asset_tag}</div></td>
                        <td>{who(a.holder_name, a.department_name)}<div className="cell-sub">{a.holder_name ? a.department_name : 'ทั้งแผนก'}</div></td>
                        <td className="nowrap">{fmtDate(a.due_date)}</td>
                        <td className="text-right"><span className="chip chip-danger">{Math.abs(daysFromToday(a.due_date))} วัน</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <div className="grid-2">
            <SpendChart data={data.spend} />
            <Card title="อุปกรณ์ตามหมวดหมู่">
              <div className="stack" style={{ gap: 10 }}>
                {data.byCategory.map((x) => (
                  <div key={x.name}>
                    <div className="row" style={{ fontSize: 13, marginBottom: 4 }}>
                      <span>{x.name}</span><span className="spacer" /><span className="mono muted">{fmtNum(x.n)}</span>
                    </div>
                    <div className="stock-bar" style={{ width: '100%' }}>
                      <span style={{ width: `${(x.n / data.byCategory[0].n) * 100}%`, background: 'var(--brand)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
        <ActivityFeed />
      </div>
    </>
  );
}
