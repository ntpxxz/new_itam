import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Printer, Tags, Search, AlertCircle } from 'lucide-react';
import { api } from '../api.js';
import { useLookup, useDebounced } from '../hooks.js';
import { PageHeader, Card, Empty, Select } from '../components/ui.jsx';

export default function Labels() {
  const [sp] = useSearchParams();
  const ids = useMemo(() => (sp.get('ids') || '').split(',').filter(Boolean), [sp]);
  const [rows, setRows] = useState([]);
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const cats = useLookup('categories', { kind: 'asset' });
  const locs = useLookup('locations');
  const origin = window.location.origin;

  useEffect(() => {
    if (ids.length) {
      Promise.all(ids.map((id) => api.get(`/api/assets/${id}`).then((d) => d.asset).catch(() => null))).then((r) => setRows(r.filter(Boolean)));
    } else if (category || location || dq) {
      api.get('/api/assets', { category_id: category, location_id: location, q: dq, pageSize: 200 }).then((d) => setRows(d.rows));
    } else setRows([]);
  }, [ids, category, location, dq]);

  return (
    <>
      <PageHeader title="พิมพ์สติ๊กเกอร์ QR" sub="พิมพ์บนกระดาษสติ๊กเกอร์ A4 แล้วติดบนอุปกรณ์ · สแกนด้วยกล้องมือถือเพื่อเปิดข้อมูลทันที">
        <button className="btn btn-primary" onClick={() => window.print()} disabled={!rows.length}><Printer size={16} />พิมพ์ {rows.length || ''} ดวง</button>
      </PageHeader>

      {['localhost', '127.0.0.1'].includes(window.location.hostname) && (
        <div className="alert info no-print">
          <AlertCircle size={18} />
          <span className="alert-detail">
            คุณเปิดผ่าน localhost — ถ้ายังไม่ได้ตั้ง “URL ของระบบ” ใน <Link to="/settings">ตั้งค่าระบบ</Link> QR จะชี้ไปที่ localhost ซึ่งมือถือเปิดไม่ได้
            แก้ได้โดยตั้งค่า URL หรือเปิดหน้านี้ผ่าน IP ของเครื่อง เช่น http://192.168.1.10:3093
          </span>
        </div>
      )}
      {!ids.length && (
        <Card className="no-print">
          <div className="row-wrap">
            <div className="input-icon" style={{ flex: 1, minWidth: 200 }}>
              <Search size={16} aria-hidden />
              <input className="input" placeholder="ค้นหา" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหาอุปกรณ์" />
            </div>
            <Select value={category} onChange={setCategory} placeholder="ทุกหมวดหมู่" options={cats.map((c) => ({ value: c.id, label: c.name }))} style={{ width: 'auto' }} />
            <Select value={location} onChange={setLocation} placeholder="ทุกสถานที่" options={locs.map((l) => ({ value: l.id, label: l.name }))} style={{ width: 'auto' }} />
          </div>
          <p className="field-hint" style={{ marginTop: 8 }}>หรือเลือกหลายรายการจาก <Link to="/assets">หน้าอุปกรณ์</Link> แล้วกด “พิมพ์สติ๊กเกอร์”</p>
        </Card>
      )}

      {!rows.length ? (
        <Card><Empty icon={Tags} title="ยังไม่ได้เลือกอุปกรณ์">เลือกหมวดหมู่ สถานที่ หรือค้นหา เพื่อแสดงสติ๊กเกอร์</Empty></Card>
      ) : (
        <div className="label-sheet">
          {rows.map((a) => (
            <div className="label" key={a.id}>
              <img src={`/api/assets/${a.id}/qr?origin=${encodeURIComponent(origin)}`} alt={`QR ${a.asset_tag}`} />
              <div style={{ minWidth: 0 }}>
                <div className="l-org">IT Asset · AssetFlow</div>
                <div className="l-tag">{a.asset_tag}</div>
                <div className="l-name">{a.name}</div>
                {a.serial_no && <div className="l-name mono">SN {a.serial_no}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
