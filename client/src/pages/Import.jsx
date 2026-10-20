import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileSpreadsheet, Download, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { api, download } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Chip } from '../components/ui.jsx';

export default function ImportPage() {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (dryRun) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true);
    try {
      const r = await api.post(`/api/assets/import${dryRun ? '?dryRun=1' : ''}`, fd);
      setResult(r);
      if (!dryRun && r.created) { toast.success(`นำเข้าอุปกรณ์ ${r.created} รายการแล้ว`); setFile(null); }
      else if (!dryRun && r.errors) toast.error(`ยังนำเข้าไม่ได้ — แก้ไข ${r.errors} แถวที่มีปัญหาในไฟล์ก่อน`);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="นำเข้า Excel" sub="นำข้อมูลอุปกรณ์เดิมเข้าระบบทีละมากๆ — ระบบจะตรวจสอบทุกแถวก่อนบันทึก">
        <button className="btn" onClick={() => download('/api/assets/import/template')}><Download size={16} />ดาวน์โหลดแม่แบบ</button>
      </PageHeader>

      <div className="detail-grid">
        <Card title="1. เลือกไฟล์และตรวจสอบ">
          <div className="stack">
            <label className="empty" style={{ border: '1.5px dashed var(--border-strong)', borderRadius: 10, cursor: 'pointer', padding: 32 }}>
              <FileSpreadsheet size={32} />
              <div className="t">{file ? file.name : 'คลิกเพื่อเลือกไฟล์ .xlsx'}</div>
              <div style={{ fontSize: 12.5 }}>ใช้แม่แบบของระบบ ไม่เกิน 10 MB</div>
              <input type="file" className="sr-only" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }} />
            </label>
            <div className="row-wrap">
              <button className="btn" disabled={!file || busy} onClick={() => run(true)}>ตรวจสอบไฟล์</button>
              <button className="btn btn-primary" disabled={!file || busy || !result?.dryRun || result.errors > 0} onClick={() => run(false)}>
                <Upload size={16} />นำเข้า {result?.dryRun && !result.errors ? `${result.total} รายการ` : ''}
              </button>
            </div>
            {result && (
              <div className={`alert ${result.errors ? 'danger' : 'info'}`}>
                {result.errors ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                <span>
                  {result.created ? <>นำเข้าสำเร็จ {result.created} รายการ · <Link to="/assets">ดูรายการอุปกรณ์</Link></>
                    : result.errors ? `พบปัญหา ${result.errors} จาก ${result.total} แถว — แก้ไขในไฟล์แล้วเลือกไฟล์ใหม่`
                      : `ทุกแถวถูกต้อง (${result.total} รายการ) — กด “นำเข้า” เพื่อบันทึก`}
                </span>
              </div>
            )}
            {result?.results?.length > 0 && (
              <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table className="table compact">
                  <thead><tr><th>แถว</th><th>ชื่อ</th><th>ผล</th></tr></thead>
                  <tbody>
                    {result.results.map((r) => (
                      <tr key={r.row}>
                        <td className="mono">{r.row}</td>
                        <td>{r.name || '—'}</td>
                        <td>{r.ok ? <Chip tone="success">ถูกต้อง</Chip> : <span className="danger-text" style={{ fontSize: 12.5 }}>{r.error}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
        <Card title="คำแนะนำ">
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5 }}>
            <li>ดาวน์โหลดแม่แบบ แล้วกรอกข้อมูลตั้งแต่แถวที่ 2</li>
            <li>ช่อง <strong>หมวดหมู่</strong> และ <strong>ชื่อ</strong> จำเป็นต้องกรอก ชื่อหมวด/สถานที่/ผู้ขาย ต้องตรงกับใน <Link to="/master">ข้อมูลหลัก</Link></li>
            <li>วันที่ใช้รูปแบบ <span className="mono">YYYY-MM-DD</span> เช่น <span className="mono">2026-01-15</span></li>
            <li>รหัสทรัพย์สินออกให้อัตโนมัติ ไม่ต้องกรอก</li>
            <li>ระบบนำเข้าเมื่อ <strong>ทุกแถวถูกต้อง</strong> เท่านั้น เพื่อป้องกันข้อมูลเข้าไม่ครบ</li>
          </ol>
        </Card>
      </div>
    </>
  );
}
