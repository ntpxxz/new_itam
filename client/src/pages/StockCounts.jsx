import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, ClipboardCheck } from 'lucide-react';
import { useApi, useLookup } from '../hooks.js';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Empty, Loading, Modal, Field, Select, Chip } from '../components/ui.jsx';
import { fmtDateTime, fmtNum } from '../format.js';

export default function StockCounts() {
  const { data, loading } = useApi('/api/stock-counts');
  const [creating, setCreating] = useState(false);
  const [v, setV] = useState({ name: `ตรวจนับประจำปี ${new Date().getFullYear()}`, location_id: '' });
  const locs = useLookup('locations');
  const toast = useToast();
  const navigate = useNavigate();

  const create = async (e) => {
    e.preventDefault();
    try {
      const { id } = await api.post('/api/stock-counts', v);
      navigate(`/stock-counts/${id}`);
    } catch (ex) { toast.error(ex); }
  };

  return (
    <>
      <PageHeader title="ตรวจนับ" sub="สแกน QR ไล่ทีละจุด แล้วระบบสรุปรายการที่พบ ขาด หรือเกินจากทะเบียน">
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} />เริ่มรอบตรวจนับ</button>
      </PageHeader>
      <Card noBody>
        {loading && !data ? <Loading /> : !data?.rows.length ? (
          <Empty icon={ClipboardCheck} title="ยังไม่มีรอบตรวจนับ">เริ่มรอบแรกเพื่อเทียบของจริงกับทะเบียน</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>รอบตรวจนับ</th><th>ขอบเขต</th><th>สถานะ</th><th className="text-right">สแกนแล้ว</th><th>เริ่มเมื่อ</th><th>ผู้สร้าง</th></tr></thead>
              <tbody>
                {data.rows.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => navigate(`/stock-counts/${c.id}`)}>
                    <td><Link to={`/stock-counts/${c.id}`} className="cell-main">{c.name}</Link></td>
                    <td className="muted">{c.location_name || 'ทุกสถานที่'}</td>
                    <td>{c.status === 'open' ? <Chip tone="brand">กำลังตรวจนับ</Chip> : <Chip tone="success">ปิดแล้ว</Chip>}</td>
                    <td className="text-right mono">{fmtNum(c.scan_count)}</td>
                    <td className="muted nowrap">{fmtDateTime(c.created_at)}</td>
                    <td className="muted">{c.created_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {creating && (
        <Modal title="เริ่มรอบตรวจนับ" onClose={() => setCreating(false)} footer={(
          <><button className="btn" onClick={() => setCreating(false)}>ยกเลิก</button><button className="btn btn-primary" type="submit" form="sc-form">เริ่มสแกน</button></>
        )}>
          <form id="sc-form" className="stack" style={{ gap: 14 }} onSubmit={create}>
            <Field label="ชื่อรอบ" required><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
            <Field label="ขอบเขต" hint="เลือกสถานที่เพื่อเทียบเฉพาะอุปกรณ์ที่ควรอยู่ที่นั่น">
              <Select value={v.location_id} onChange={(x) => setV({ ...v, location_id: x })} placeholder="ทุกสถานที่" options={locs.map((l) => ({ value: l.id, label: l.name }))} />
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
}
