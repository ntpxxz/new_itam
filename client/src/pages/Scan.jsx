import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Keyboard, ArrowRight, Laptop } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, StatusChip } from '../components/ui.jsx';
import QrScanner from '../components/QrScanner.jsx';
import { who } from '../format.js';

export function extractTag(text) {
  const t = String(text).trim();
  const m = t.match(/\/a\/([^/?#\s]+)/);
  return m ? decodeURIComponent(m[1]) : t;
}

const QUICK = { available: ['borrow', 'issue'], borrowed: ['return'], issued: ['return', 'transfer'], repair: ['repair_in'] };
const LABEL = { borrow: 'ยืม', issue: 'เบิกถาวร', return: 'รับคืน', transfer: 'โอนย้าย', repair_in: 'รับคืนจากซ่อม' };

export default function Scan() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const [code, setCode] = useState('');
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);

  const lookup = async (raw) => {
    const tag = extractTag(raw);
    if (!tag) return;
    setBusy(true);
    try {
      const { id } = await api.get(`/api/assets/by-tag/${encodeURIComponent(tag)}`);
      const d = await api.get(`/api/assets/${id}`);
      setFound(d.asset);
      setCode('');
    } catch (e) {
      setFound(null);
      toast.error(e.status === 404 ? `ไม่พบอุปกรณ์รหัส "${tag}" — ตรวจสอบรหัสแล้วลองใหม่` : e);
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="สแกน QR" sub="สแกนสติ๊กเกอร์บนอุปกรณ์เพื่อดูข้อมูลหรือทำรายการยืม-คืนทันที" />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card>
          <div className="stack">
            <QrScanner onResult={lookup} paused={busy} />
            <form className="row" onSubmit={(e) => { e.preventDefault(); lookup(code); }}>
              <div className="input-icon" style={{ flex: 1 }}>
                <Keyboard size={16} aria-hidden />
                <input className="input mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="พิมพ์รหัสทรัพย์สิน หรือ Serial" aria-label="รหัสทรัพย์สิน" autoCapitalize="characters" />
              </div>
              <button className="btn btn-primary" disabled={!code.trim() || busy}>ค้นหา</button>
            </form>
            <p className="field-hint">รองรับเครื่องสแกนบาร์โค้ดแบบ USB — คลิกที่ช่องแล้วยิงได้เลย</p>
          </div>
        </Card>

        <Card title="ผลการสแกน">
          {!found ? (
            <div className="empty" style={{ padding: 24 }}><Laptop size={28} /><div>สแกนหรือพิมพ์รหัสเพื่อเริ่ม</div></div>
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              <div className="scan-result">
                <span className="thumb" style={{ width: 48, height: 48 }}>{found.image_path ? <img src={found.image_path} alt="" /> : <Laptop size={20} />}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cell-main">{found.name}</div>
                  <div className="tag">{found.asset_tag}</div>
                  <div style={{ marginTop: 4 }}><StatusChip status={found.status} /></div>
                </div>
              </div>
              {(found.holder_name || found.holder_section) && <div className="muted" style={{ fontSize: 13 }}>ถือครองโดย <strong style={{ color: 'var(--text)', fontWeight: 500 }}>{who(found.holder_name, found.holder_section)}</strong> · {found.department_name}</div>}
              <div className="action-grid">
                {can('asset.transact') && (QUICK[found.status] || []).map((k) => (
                  <button key={k} className="btn btn-lg" onClick={() => navigate(`/assets/${found.id}?action=${k}`)}>{LABEL[k]}</button>
                ))}
              </div>
              <Link to={`/assets/${found.id}`} className="btn btn-block">ดูรายละเอียดทั้งหมด <ArrowRight size={14} /></Link>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
