import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Keyboard, CheckCircle2, XCircle, HelpCircle, Lock, Camera } from 'lucide-react';
import { useApi } from '../hooks.js';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Loading, Empty, Tabs, StatusChip, Chip, Confirm } from '../components/ui.jsx';
import QrScanner from '../components/QrScanner.jsx';
import { fmtDateTime, fmtNum } from '../format.js';

export default function StockCountDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data, loading, reload } = useApi(`/api/stock-counts/${id}`);
  const [code, setCode] = useState('');
  const [tab, setTab] = useState('missing');
  const [camera, setCamera] = useState(false);
  const [closing, setClosing] = useState(false);
  const [lastScan, setLastScan] = useState(null);
  const inputRef = useRef(null);

  const scan = async (raw) => {
    const c = String(raw).trim();
    if (!c) return;
    try {
      const r = await api.post(`/api/stock-counts/${id}/scan`, { code: c });
      setLastScan(r);
      if (r.duplicate) toast.info(`${r.code} สแกนไปแล้ว`);
      else if (r.unknown) toast.error(`ไม่พบรหัส ${r.code} ในทะเบียน — บันทึกเป็น “เกินจากทะเบียน”`);
      else if (r.wrongLocation) toast.info(`${r.asset.asset_tag} พบแล้ว แต่ในทะเบียนอยู่ที่สถานที่อื่น`);
      setCode('');
      reload();
    } catch (e) { toast.error(e); }
    inputRef.current?.focus();
  };

  if (loading && !data) return <Card><Loading rows={8} /></Card>;
  if (!data) return null;
  const { count, found, missing, unexpected, expectedCount } = data;
  const open = count.status === 'open';
  const pct = expectedCount ? Math.round((found.length / expectedCount) * 100) : 0;

  return (
    <>
      <PageHeader title={count.name} crumbs={[{ label: 'ตรวจนับ', to: '/stock-counts' }, { label: count.name }]}
        sub={`${count.location_name || 'ทุกสถานที่'} · เริ่ม ${fmtDateTime(count.created_at)}${count.closed_at ? ` · ปิด ${fmtDateTime(count.closed_at)}` : ''}`}>
        {open ? <button className="btn" onClick={() => setClosing(true)}><Lock size={16} />ปิดรอบตรวจนับ</button> : <Chip tone="success">ปิดแล้ว</Chip>}
      </PageHeader>

      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className="card kpi"><span className="kpi-label">ความคืบหน้า</span><span className="kpi-value">{pct}%</span>
          <div className="stock-bar" style={{ width: '100%' }}><span style={{ width: `${pct}%` }} /></div></div>
        <div className="card kpi"><span className="kpi-label"><span className="kpi-dot" style={{ background: 'var(--success)' }} />พบแล้ว</span><span className="kpi-value">{fmtNum(found.length)}</span><span className="kpi-trend">จาก {fmtNum(expectedCount)} รายการในทะเบียน</span></div>
        <div className="card kpi"><span className="kpi-label"><span className="kpi-dot" style={{ background: 'var(--danger)' }} />ยังไม่พบ (ขาด)</span><span className="kpi-value">{fmtNum(missing.length)}</span></div>
        <div className="card kpi"><span className="kpi-label"><span className="kpi-dot" style={{ background: 'var(--warning)' }} />เกินจากทะเบียน</span><span className="kpi-value">{fmtNum(unexpected.length)}</span></div>
      </div>

      <div className="detail-grid">
        <Card noBody>
          <Tabs value={tab} onChange={setTab} tabs={[
            { value: 'missing', label: `ยังไม่พบ (${missing.length})` },
            { value: 'found', label: `พบแล้ว (${found.length})` },
            { value: 'unexpected', label: `เกินจากทะเบียน (${unexpected.length})` },
          ]} />
          {(() => {
            const list = tab === 'missing' ? missing : tab === 'found' ? found : unexpected;
            if (!list.length) return <Empty title={tab === 'missing' ? 'พบครบทุกรายการแล้ว' : 'ไม่มีรายการ'} />;
            return (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>อุปกรณ์</th><th>สถานะ</th><th>{tab === 'unexpected' ? 'สแกนเมื่อ' : 'สถานที่ / ผู้ถือครอง'}</th></tr></thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id + (r.raw_code || '')}>
                        <td>
                          {r.asset_id || r.status ? <Link to={`/assets/${r.asset_id || r.id}`} className="cell-main">{r.name}</Link> : <span className="cell-main">ไม่อยู่ในทะเบียน</span>}
                          <div className="tag">{r.asset_tag || r.raw_code}</div>
                        </td>
                        <td>{r.status ? <StatusChip status={r.status} /> : r.asset_id ? <Chip tone="warning">อยู่สถานที่อื่น</Chip> : <Chip tone="danger">ไม่รู้จักรหัส</Chip>}</td>
                        <td className="muted">{tab === 'unexpected' ? fmtDateTime(r.scanned_at) : r.holder_name || r.location_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </Card>

        {open && (
          <Card title="สแกน" actions={<button className="btn btn-sm" onClick={() => setCamera((c) => !c)}><Camera size={14} />{camera ? 'ปิดกล้อง' : 'เปิดกล้อง'}</button>}>
            <div className="stack" style={{ gap: 12 }}>
              {camera && <QrScanner onResult={scan} />}
              <form onSubmit={(e) => { e.preventDefault(); scan(code); }} className="row">
                <div className="input-icon" style={{ flex: 1 }}>
                  <Keyboard size={16} aria-hidden />
                  <input ref={inputRef} className="input mono" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="ยิงบาร์โค้ด หรือพิมพ์รหัส" aria-label="รหัสทรัพย์สิน" />
                </div>
                <button className="btn btn-primary" disabled={!code.trim()}>บันทึก</button>
              </form>
              {lastScan && (
                <div className="scan-result">
                  {lastScan.unknown ? <HelpCircle size={20} className="danger-text" /> : lastScan.duplicate ? <CheckCircle2 size={20} className="muted" /> : lastScan.wrongLocation ? <XCircle size={20} style={{ color: 'var(--warning)' }} /> : <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />}
                  <div>
                    <div className="cell-main">{lastScan.asset?.name || 'ไม่พบในทะเบียน'}</div>
                    <div className="tag">{lastScan.code}{lastScan.duplicate && ' · สแกนซ้ำ'}</div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      {closing && (
        <Confirm title="ปิดรอบตรวจนับ?" confirmLabel="ปิดรอบ" onClose={() => setClosing(false)}
          message={`สรุป: พบ ${found.length} · ขาด ${missing.length} · เกิน ${unexpected.length} รายการ — หลังปิดจะสแกนเพิ่มไม่ได้`}
          onConfirm={async () => { try { await api.post(`/api/stock-counts/${id}/close`); toast.success('ปิดรอบตรวจนับแล้ว'); reload(); } catch (e) { toast.error(e); throw e; } }} />
      )}
    </>
  );
}
