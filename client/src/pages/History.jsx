import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Search, History as HistoryIcon, Paperclip } from 'lucide-react';
import { useApi, useQueryState, useDebounced } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { download } from '../api.js';
import { PageHeader, Pagination, Empty, Loading, Select, StatusChip } from '../components/ui.jsx';
import { ACTION_META, ActionIcon } from '../components/actions.jsx';
import { fmtDateTime, fmtDate, who } from '../format.js';

export default function HistoryPage() {
  const { can } = useAuth();
  const [f, setF] = useQueryState({ q: '', action: '', from: '', to: '', page: 1 });
  const [q, setQ] = useState(f.q);
  const dq = useDebounced(q);
  useEffect(() => { if (dq !== f.q) setF({ q: dq }); }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, loading } = useApi('/api/transactions', { ...f, pageSize: 30 });

  return (
    <>
      <PageHeader title="ประวัติรายการ" sub="ทุกการเคลื่อนไหวของอุปกรณ์ — รับเข้า ยืม คืน เบิก โอน ซ่อม Scrap (แก้ไขหรือลบไม่ได้)">
        {can('report.export') && <button className="btn" onClick={() => download('/api/transactions/export', f)}><Download size={16} />ส่งออก Excel</button>}
      </PageHeader>
      <section className="card">
        <div className="toolbar">
          <div className="input-icon">
            <Search size={16} aria-hidden />
            <input className="input" type="search" placeholder="รหัส, ชื่ออุปกรณ์, ชื่อพนักงาน" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหา" />
          </div>
          <Select value={f.action} onChange={(v) => setF({ action: v })} placeholder="ทุกรายการ" aria-label="ประเภทรายการ"
            options={Object.entries(ACTION_META).map(([k, m]) => ({ value: k, label: m.label }))} />
          <label className="row" style={{ gap: 6, fontSize: 13 }}>
            <span className="muted">ตั้งแต่</span>
            <input type="date" className="input" style={{ width: 160 }} value={f.from} onChange={(e) => setF({ from: e.target.value })} />
          </label>
          <label className="row" style={{ gap: 6, fontSize: 13 }}>
            <span className="muted">ถึง</span>
            <input type="date" className="input" style={{ width: 160 }} value={f.to} onChange={(e) => setF({ to: e.target.value })} />
          </label>
        </div>
        {loading && !data ? <Loading rows={10} /> : !data?.rows.length ? <Empty icon={HistoryIcon} title="ไม่พบรายการ">ลองเปลี่ยนช่วงวันที่หรือตัวกรอง</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>วันเวลา</th><th>รายการ</th><th>อุปกรณ์</th><th>สถานะ</th><th>พนักงาน / ปลายทาง</th><th>หมายเหตุ</th><th>ผู้ทำรายการ</th></tr></thead>
              <tbody>
                {data.rows.map((t) => {
                  const m = ACTION_META[t.action];
                  return (
                    <tr key={t.id}>
                      <td className="nowrap muted">{t.doc_date ? <><div style={{ color: 'var(--text)' }}>{fmtDate(t.doc_date)}</div><div className="cell-sub">บันทึก {fmtDateTime(t.created_at)}</div></> : fmtDateTime(t.created_at)}{t.doc_no && <div><Link to={`/documents/${t.doc_id}`} className="mono" style={{ fontSize: 12 }}>{t.doc_no}</Link></div>}</td>
                      <td><div className="row" style={{ gap: 8 }}><ActionIcon meta={m} size={12} /><span className="nowrap">{m?.label || t.action}</span></div></td>
                      <td><Link to={`/assets/${t.asset_id}`} className="cell-main">{t.asset_name}</Link><div className="tag">{t.asset_tag}</div></td>
                      <td className="nowrap">{t.to_status ? <StatusChip status={t.to_status} /> : '—'}</td>
                      <td>
                        {t.person_name || t.section || t.department_name || t.location_name ? (
                          <>{(t.person_name || t.section) && <div>{who(t.person_name, t.section)}</div>}<div className="cell-sub">{[t.department_name, t.location_name].filter(Boolean).join(' · ')}</div></>
                        ) : <span className="subtle">—</span>}
                        {t.due_date && <div className="cell-sub">คืน {fmtDate(t.due_date)}</div>}
                      </td>
                      <td style={{ maxWidth: 240 }}>
                        <span className="muted">{t.note || ''}</span>
                        {t.evidence_path && <a href={t.evidence_path} target="_blank" rel="noreferrer" className="row" style={{ gap: 4, fontSize: 12 }}><Paperclip size={12} />หลักฐาน</a>}
                      </td>
                      <td className="muted nowrap">{t.performed_by_name}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={Number(f.page)} pageSize={data.pageSize} total={data.total} onPage={(page) => setF({ page })} />}
      </section>
    </>
  );
}
