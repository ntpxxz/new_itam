import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Download, BarChart3, Laptop, Package } from 'lucide-react';
import { useApi, useQueryState } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { download } from '../api.js';
import { PageHeader, Card, Loading, Empty, Tabs } from '../components/ui.jsx';
import { fmtNum, fmtMoney, fmtDate, todayISO } from '../format.js';

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
function preset(key) {
  const now = new Date();
  const y = now.getFullYear(); const m = now.getMonth();
  switch (key) {
    case 'this_month': return [iso(new Date(y, m, 1)), todayISO()];
    case 'last_month': return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    case '3_months': return [iso(new Date(y, m - 2, 1)), todayISO()];
    case 'this_year': return [iso(new Date(y, 0, 1)), todayISO()];
    default: return ['', ''];
  }
}
const PRESETS = [['this_month', 'เดือนนี้'], ['last_month', 'เดือนก่อน'], ['3_months', '3 เดือน'], ['this_year', 'ปีนี้'], ['all', 'ทั้งหมด']];

export default function Reports() {
  const { can } = useAuth();
  const [q, setQ] = useQueryState({ range: 'this_month', from: '', to: '', mode: '', kind: '' });
  const [from, to] = q.range === 'custom' ? [q.from, q.to] : preset(q.range);
  const f = { from, to, mode: q.mode, kind: q.kind };
  const setF = (patch) => {
    if ('from' in patch || 'to' in patch) setQ({ range: 'custom', from, to, ...patch });
    else setQ(patch);
  };
  const [open, setOpen] = useState(() => new Set());
  const { data, loading } = useApi('/api/reports/issues-by-department', f);
  const activePreset = q.range === 'custom' ? null : q.range;

  const toggle = (k) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const t = data?.totals;
  const maxValue = Math.max(1, ...(data?.rows || []).map((r) => r.value));

  return (
    <>
      <PageHeader title="สรุปการเบิกตามแผนก"
        sub={`${f.from ? fmtDate(f.from) : 'เริ่มต้น'} – ${f.to ? fmtDate(f.to) : 'ปัจจุบัน'} · นับจากวันที่เบิกตามใบเบิก (รวมการเบิกย้อนหลัง)`}>
        {can('report.export') && (
          <button className="btn btn-primary" onClick={() => download('/api/reports/issues-by-department/export', f)} disabled={!data?.rows.length}>
            <Download size={16} />ส่งออก Excel
          </button>
        )}
      </PageHeader>

      <Card>
        <div className="row-wrap" style={{ gap: 12 }}>
          <div className="seg" role="group" aria-label="ช่วงเวลา">
            {PRESETS.map(([k, label]) => (
              <button key={k} aria-pressed={activePreset === k} onClick={() => setQ({ range: k, from: '', to: '' })}>{label}</button>
            ))}
          </div>
          <label className="row" style={{ gap: 6, fontSize: 13 }}>
            <span className="muted">ตั้งแต่</span>
            <input type="date" className="input" style={{ width: 160 }} value={f.from} max={f.to || todayISO()} onChange={(e) => setF({ from: e.target.value })} />
          </label>
          <label className="row" style={{ gap: 6, fontSize: 13 }}>
            <span className="muted">ถึง</span>
            <input type="date" className="input" style={{ width: 160 }} value={f.to} min={f.from} max={todayISO()} onChange={(e) => setF({ to: e.target.value })} />
          </label>
          <span className="spacer" />
          <div className="seg" role="group" aria-label="ประเภทการเบิก">
            {[['', 'ทุกประเภท'], ['issue', 'เบิกออก'], ['borrow', 'ยืม']].map(([k, l]) => <button key={k} aria-pressed={f.mode === k} onClick={() => setF({ mode: k })}>{l}</button>)}
          </div>
          <div className="seg" role="group" aria-label="วิธีติดตาม">
            {[['', 'ทั้งหมด'], ['asset', 'รายชิ้น'], ['consumable', 'นับจำนวน']].map(([k, l]) => <button key={k} aria-pressed={f.kind === k} onClick={() => setF({ kind: k })}>{l}</button>)}
          </div>
        </div>
      </Card>

      {t && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <div className="card kpi"><span className="kpi-label">แผนกที่เบิก</span><span className="kpi-value">{fmtNum(data.rows.length)}</span></div>
          <div className="card kpi"><span className="kpi-label"><span className="kpi-dot" style={{ background: 'var(--brand)' }} />เบิกถาวร (รายชิ้น)</span><span className="kpi-value">{fmtNum(t.assets_issued)}</span></div>
          <div className="card kpi"><span className="kpi-label"><span className="kpi-dot" style={{ background: 'var(--brand)' }} />ยืม (รายชิ้น)</span><span className="kpi-value">{fmtNum(t.assets_borrowed)}</span></div>
          <div className="card kpi"><span className="kpi-label"><span className="kpi-dot" style={{ background: 'var(--success)' }} />นับจำนวน (หน่วย)</span><span className="kpi-value">{fmtNum(t.units)}</span></div>
          <div className="card kpi"><span className="kpi-label">มูลค่ารวม</span><span className="kpi-value" style={{ fontSize: 22 }}>{fmtMoney(t.value)}</span></div>
        </div>
      )}

      <Card noBody title="แยกตามแผนก" actions={data?.rows.length > 0 && (
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(open.size ? new Set() : new Set(data.rows.map((r) => String(r.department_id))))}>
          {open.size ? 'ย่อทั้งหมด' : 'ขยายทั้งหมด'}
        </button>
      )}>
        {loading && !data ? <Loading rows={6} /> : !data?.rows.length ? (
          <Empty icon={BarChart3} title="ไม่มีการเบิกในช่วงนี้">ลองเลือกช่วงเวลาอื่น หรือเปลี่ยนตัวกรอง</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 32 }} /><th>แผนก</th>
                  <th className="text-right">เบิกถาวร</th><th className="text-right">ยืม</th><th className="text-right">นับจำนวน</th>
                  <th>มูลค่า</th><th className="text-right">ผู้รับ</th><th className="text-right">ใบเบิก</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((d) => {
                  const k = String(d.department_id);
                  const isOpen = open.has(k);
                  return (
                    <Fragment key={k}>
                      <tr className="clickable" onClick={() => toggle(k)} aria-expanded={isOpen}>
                        <td>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                        <td className="cell-main">{d.department_name}<div className="cell-sub">{d.sections.filter((s) => s.section).length} Section</div></td>
                        <td className="text-right mono">{fmtNum(d.assets_issued)}</td>
                        <td className="text-right mono">{fmtNum(d.assets_borrowed)}</td>
                        <td className="text-right mono">{fmtNum(d.units)}</td>
                        <td style={{ minWidth: 180 }}>
                          <div className="row" style={{ gap: 8 }}>
                            <div className="stock-bar" style={{ width: 90 }} aria-hidden><span style={{ width: `${(d.value / maxValue) * 100}%`, background: 'var(--brand)' }} /></div>
                            <span className="mono nowrap">{fmtMoney(d.value)}</span>
                          </div>
                        </td>
                        <td className="text-right mono">{fmtNum(d.people)}</td>
                        <td className="text-right mono">{fmtNum(d.slips)}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td />
                          <td colSpan={7} style={{ background: 'var(--bg-subtle)', padding: 16 }}>
                            <DeptDetail d={d} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 600 }}>
                  <td /><td style={{ padding: '12px 16px' }}>รวม</td>
                  <td className="text-right mono" style={{ padding: '12px 16px' }}>{fmtNum(t.assets_issued)}</td>
                  <td className="text-right mono" style={{ padding: '12px 16px' }}>{fmtNum(t.assets_borrowed)}</td>
                  <td className="text-right mono" style={{ padding: '12px 16px' }}>{fmtNum(t.units)}</td>
                  <td className="mono" style={{ padding: '12px 16px' }}>{fmtMoney(t.value)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
      <p className="field-hint">มูลค่า: รายชิ้นใช้ราคาซื้อ · นับจำนวนใช้ราคาต่อหน่วยปัจจุบัน × จำนวนที่เบิก · “ไม่ระบุแผนก” คือรายการที่เบิกโดยไม่ได้กรอกแผนก</p>
    </>
  );
}

function DeptDetail({ d }) {
  const [tab, setTab] = useState('sections');
  return (
    <div className="stack" style={{ gap: 10 }}>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'sections', label: `แยกตาม Section (${d.sections.length})` }, { value: 'items', label: `รายการที่เบิก (${d.items.length})` }]} />
      {tab === 'sections' ? (
        <table className="table compact" style={{ background: 'var(--bg-surface)' }}>
          <thead><tr><th>Section</th><th className="text-right">รายชิ้น</th><th className="text-right">นับจำนวน</th><th className="text-right">มูลค่า</th></tr></thead>
          <tbody>
            {d.sections.map((s) => (
              <tr key={s.section || '—'}>
                <td>{s.section || <span className="subtle">ไม่ระบุ Section</span>}</td>
                <td className="text-right mono">{fmtNum(s.assets)}</td>
                <td className="text-right mono">{fmtNum(s.units)}</td>
                <td className="text-right mono">{fmtMoney(s.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="table compact" style={{ background: 'var(--bg-surface)' }}>
          <thead><tr><th>รายการ</th><th>หมวดหมู่</th><th className="text-right">จำนวน</th><th className="text-right">มูลค่า</th></tr></thead>
          <tbody>
            {d.items.map((it) => (
              <tr key={`${it.kind}${it.code || it.name}`}>
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    {it.kind === 'asset' ? <Laptop size={14} className="muted" /> : <Package size={14} className="muted" />}
                    <span>{it.name}</span>{it.code && <span className="tag">{it.code}</span>}
                  </div>
                </td>
                <td className="muted">{it.category_name}</td>
                <td className="text-right nowrap"><span className="mono">{fmtNum(it.qty)}</span> {it.unit}</td>
                <td className="text-right mono">{fmtMoney(it.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
