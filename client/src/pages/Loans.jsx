import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, ScanLine, ArrowDownLeft, Search } from 'lucide-react';
import { useApi, useQueryState, useDebounced } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { PageHeader, StatusChip, Pagination, Empty, Loading } from '../components/ui.jsx';
import ActionDialog from '../components/ActionDialog.jsx';
import { fmtDate, daysFromToday, who } from '../format.js';

const FILTERS = [
  { value: 'borrowed', label: 'ถูกยืมทั้งหมด', params: { status: 'borrowed' } },
  { value: 'overdue', label: 'เกินกำหนดคืน', params: { status: 'borrowed', overdue: '1' } },
  { value: 'soon', label: 'ครบกำหนดใน 3 วัน', params: { status: 'borrowed', due_within: 3 } },
  { value: 'issued', label: 'เบิกถาวร', params: { status: 'issued' } },
];

export default function Loans() {
  const { can } = useAuth();
  const [f, setF] = useQueryState({ filter: 'borrowed', page: 1 });
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [action, setAction] = useState(null);
  const preset = FILTERS.find((x) => x.value === f.filter) || FILTERS[0];
  const { data, loading, reload } = useApi('/api/assets', { sort: 'due_date', dir: 'asc', ...preset.params, q: dq, page: f.page, pageSize: 20 });

  return (
    <>
      <PageHeader title="ยืม-คืน" sub="อุปกรณ์ที่อยู่กับพนักงาน ติดตามกำหนดคืนและรับคืนได้จากหน้านี้">
        <Link to="/scan" className="btn"><ScanLine size={16} />สแกนเพื่อยืม-คืน</Link>
        {can('asset.transact') && <Link to="/issue?mode=borrow" className="btn btn-primary"><ArrowLeftRight size={16} />ให้ยืมอุปกรณ์</Link>}
      </PageHeader>

      <section className="card">
        <div className="toolbar">
          <div className="seg" role="group" aria-label="ประเภทรายการ">
            {FILTERS.map((x) => <button key={x.value} aria-pressed={f.filter === x.value} onClick={() => setF({ filter: x.value })}>{x.label}</button>)}
          </div>
          <span className="spacer" />
          <div className="input-icon">
            <Search size={16} aria-hidden />
            <input className="input" type="search" placeholder="ค้นหาผู้ยืม, รหัส, ชื่ออุปกรณ์" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหา" />
          </div>
        </div>
        {loading && !data ? <Loading rows={6} /> : !data?.rows.length ? (
          <Empty icon={ArrowLeftRight} title={f.filter === 'overdue' ? 'ไม่มีรายการเกินกำหนดคืน' : 'ไม่มีรายการ'}>
            {f.filter === 'overdue' ? 'ทุกรายการยืมยังอยู่ในกำหนด' : 'ยังไม่มีอุปกรณ์ในสถานะนี้'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>อุปกรณ์</th><th>ผู้ถือครอง</th><th>สถานะ</th><th>{f.filter === 'issued' ? 'สถานที่' : 'กำหนดคืน'}</th><th className="actions"><span className="sr-only">การทำงาน</span></th></tr>
              </thead>
              <tbody>
                {data.rows.map((a) => {
                  const d = daysFromToday(a.due_date);
                  return (
                    <tr key={a.id}>
                      <td><Link to={`/assets/${a.id}`} className="cell-main">{a.name}</Link><div className="tag">{a.asset_tag}</div></td>
                      <td>{who(a.holder_name, a.department_name) || '—'}<div className="cell-sub">{a.holder_name ? a.department_name : 'ทั้งแผนก'}</div></td>
                      <td><StatusChip status={a.status} /></td>
                      <td className="nowrap">
                        {a.status === 'borrowed' ? (
                          <>
                            <div>{fmtDate(a.due_date)}</div>
                            <div className={`cell-sub${d < 0 ? ' danger-text' : ''}`}>
                              {d < 0 ? `เกินกำหนด ${Math.abs(d)} วัน` : d === 0 ? 'ครบกำหนดวันนี้' : `อีก ${d} วัน`}
                            </div>
                          </>
                        ) : <span className="muted">{a.location_name || '—'}</span>}
                      </td>
                      <td className="actions">
                        {can('asset.transact') && (
                          <button className="btn btn-sm" onClick={() => setAction({ asset: a, action: { key: 'return', label: 'รับคืน', needs: [] } })}>
                            <ArrowDownLeft size={14} />รับคืน
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={Number(f.page)} pageSize={data.pageSize} total={data.total} onPage={(page) => setF({ page })} />}
      </section>

      {action && <ActionDialog asset={action.asset} action={action.action} onClose={() => setAction(null)} onDone={() => { setAction(null); reload(); }} />}
    </>
  );
}
