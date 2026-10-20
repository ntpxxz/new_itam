import { useEffect, useState } from 'react';
import { Search, ScrollText, ChevronRight, ChevronDown, Lock } from 'lucide-react';
import { useApi, useQueryState, useDebounced } from '../hooks.js';
import { PageHeader, Card, Tabs, Pagination, Loading, Empty, Select, Chip } from '../components/ui.jsx';
import { fmtDateTime } from '../format.js';

const EVENTS = {
  login: ['เข้าสู่ระบบ', 'success'], logout: ['ออกจากระบบ', 'neutral'], login_failed: ['ล็อกอินล้มเหลว', 'warning'],
  locked: ['บัญชีถูกล็อก', 'danger'], login_blocked: ['พยายามเข้าขณะถูกล็อก', 'danger'],
};
const ENTITIES = {
  asset: 'อุปกรณ์', consumable: 'วัสดุสิ้นเปลือง', user: 'ผู้ใช้', role: 'บทบาท', settings: 'ตั้งค่าระบบ', people: 'พนักงาน',
  categories: 'หมวดหมู่', locations: 'สถานที่', departments: 'แผนก', vendors: 'ผู้ขาย', stock_count: 'ตรวจนับ', asset_transaction: 'ประวัติอุปกรณ์',
};

function device(ua = '') {
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [br, os].filter(Boolean).join(' · ') || ua.slice(0, 40) || '—';
}

function Diff({ before, after }) {
  const b = before ? JSON.parse(before) : {};
  const a = after ? JSON.parse(after) : {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]) && !['updated_at'].includes(k));
  if (!keys.length) return <div className="muted" style={{ fontSize: 12.5 }}>ไม่มีการเปลี่ยนแปลงค่า</div>;
  return (
    <table className="table compact" style={{ fontSize: 12.5, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <thead><tr><th>ฟิลด์</th><th>ค่าเดิม</th><th>ค่าใหม่</th></tr></thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k}>
            <td className="mono">{k}</td>
            <td className="mono" style={{ color: 'var(--danger-text)', wordBreak: 'break-all' }}>{b[k] === undefined || b[k] === null ? '—' : JSON.stringify(b[k])}</td>
            <td className="mono" style={{ color: 'var(--success)', wordBreak: 'break-all' }}>{a[k] === undefined || a[k] === null ? '—' : JSON.stringify(a[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Logs() {
  const [f, setF] = useQueryState({ tab: 'access', q: '', event: '', entity: '', entity_id: '', page: 1 });
  const [q, setQ] = useState(f.q);
  const dq = useDebounced(q);
  useEffect(() => { if (dq !== f.q) setF({ q: dq }); }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState(null);
  const isAudit = f.tab === 'audit';
  const { data, loading } = useApi(isAudit ? '/api/admin/logs/audit' : '/api/admin/logs/access',
    isAudit ? { q: f.q, entity: f.entity, entity_id: f.entity_id, page: f.page } : { q: f.q, event: f.event, page: f.page });

  return (
    <>
      <PageHeader title="Log การใช้งาน" sub="บันทึกแบบเพิ่มได้อย่างเดียว แก้ไขหรือลบไม่ได้ · ลบอัตโนมัติเมื่อเกินระยะเวลาเก็บตาม PDPA">
        <Chip tone="neutral"><Lock size={11} />Immutable</Chip>
      </PageHeader>
      <Tabs value={f.tab} onChange={(tab) => setF({ tab, q: '', event: '', entity: '', entity_id: '' })} tabs={[
        { value: 'access', label: 'Access Log' }, { value: 'audit', label: 'Audit Trail' },
      ]} />
      <Card noBody>
        <div className="toolbar">
          <div className="input-icon">
            <Search size={16} aria-hidden />
            <input className="input" type="search" placeholder={isAudit ? 'ชื่อผู้ใช้ หรือ action' : 'ชื่อผู้ใช้ หรือ IP'} value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหา log" />
          </div>
          {isAudit ? (
            <Select value={f.entity} onChange={(v) => setF({ entity: v, entity_id: '' })} placeholder="ทุกประเภทข้อมูล" options={Object.entries(ENTITIES).map(([value, label]) => ({ value, label }))} style={{ width: 'auto' }} />
          ) : (
            <Select value={f.event} onChange={(v) => setF({ event: v })} placeholder="ทุกเหตุการณ์" options={Object.entries(EVENTS).map(([value, [label]]) => ({ value, label }))} style={{ width: 'auto' }} />
          )}
          {f.entity_id && <Chip tone="brand">ID {f.entity_id}</Chip>}
        </div>
        {loading && !data ? <Loading rows={10} /> : !data?.rows.length ? <Empty icon={ScrollText} title="ไม่พบ log" /> : (
          <div className="table-wrap">
            {isAudit ? (
              <table className="table">
                <thead><tr><th style={{ width: 32 }} /><th>วันเวลา</th><th>ผู้ใช้</th><th>ข้อมูล</th><th>การกระทำ</th><th>IP</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <FragmentRow key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="table">
                <thead><tr><th>วันเวลา</th><th>ผู้ใช้</th><th>เหตุการณ์</th><th>IP</th><th>อุปกรณ์ที่ใช้</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => {
                    const [label, tone] = EVENTS[r.event] || [r.event, 'neutral'];
                    return (
                      <tr key={r.id}>
                        <td className="nowrap muted">{fmtDateTime(r.created_at)}</td>
                        <td className="mono">{r.username || '—'}</td>
                        <td><Chip tone={tone}>{label}</Chip></td>
                        <td className="mono muted">{r.ip}</td>
                        <td className="muted" title={r.user_agent}>{device(r.user_agent)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
        {data && <Pagination page={Number(f.page)} pageSize={data.pageSize} total={data.total} onPage={(page) => setF({ page })} />}
      </Card>
    </>
  );
}

function FragmentRow({ r, open, onToggle }) {
  const hasDiff = r.before_json || r.after_json;
  return (
    <>
      <tr className={hasDiff ? 'clickable' : ''} onClick={hasDiff ? onToggle : undefined}>
        <td>{hasDiff && (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}</td>
        <td className="nowrap muted">{fmtDateTime(r.created_at)}</td>
        <td className="mono">{r.username || 'ระบบ'}</td>
        <td>{ENTITIES[r.entity] || r.entity}{r.entity_id && <span className="tag"> #{r.entity_id}</span>}</td>
        <td><span className="chip chip-neutral no-dot mono">{r.action}</span></td>
        <td className="mono muted">{r.ip}</td>
      </tr>
      {open && (
        <tr><td /><td colSpan={5} style={{ background: 'var(--bg-subtle)' }}><Diff before={r.before_json} after={r.after_json} /></td></tr>
      )}
    </>
  );
}
