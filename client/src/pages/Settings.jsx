import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useApi } from '../hooks.js';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Field, Loading } from '../components/ui.jsx';

const NUM = [
  ['max_failed_logins', 'ล็อกบัญชีเมื่อใส่รหัสผิด (ครั้ง)', 'ช่วง 3–20'],
  ['lockout_minutes', 'ระยะเวลาล็อกบัญชี (นาที)', 'ช่วง 1–1440'],
  ['session_idle_minutes', 'ออกจากระบบอัตโนมัติเมื่อไม่ใช้งาน (นาที)', 'ช่วง 5–480'],
];

export default function SettingsPage() {
  const toast = useToast();
  const { data, loading } = useApi('/api/admin/settings');
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setV(data); }, [data]);
  if (loading || !v) return <Card><Loading /></Card>;
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.put('/api/admin/settings', v); toast.success('บันทึกการตั้งค่าแล้ว'); } catch (ex) { toast.error(ex); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} className="stack" style={{ gap: 20 }}>
      <PageHeader title="ตั้งค่าระบบ" sub="ความปลอดภัยการเข้าสู่ระบบ การแจ้งเตือน และการเก็บข้อมูล">
        <button className="btn btn-primary" disabled={busy}><Save size={16} />บันทึก</button>
      </PageHeader>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card title="ความปลอดภัยการเข้าสู่ระบบ">
          <div className="stack" style={{ gap: 14 }}>
            {NUM.map(([k, label, hint]) => (
              <Field key={k} label={label} hint={hint}><input type="number" className="input mono" value={v[k]} onChange={set(k)} style={{ maxWidth: 160 }} /></Field>
            ))}
            <p className="field-hint">นโยบายรหัสผ่าน: อย่างน้อย 8 ตัว มีทั้งตัวอักษรและตัวเลข · 2FA และ AD/SSO อยู่ในแผนพัฒนาถัดไป</p>
          </div>
        </Card>
        <div className="stack">
          <Card title="การแจ้งเตือนและ QR">
            <div className="stack" style={{ gap: 14 }}>
              <Field label="แจ้งเตือนประกันหมดล่วงหน้า (วัน)" hint="แสดงบน Dashboard"><input type="number" className="input mono" value={v.warranty_alert_days} onChange={set('warranty_alert_days')} style={{ maxWidth: 160 }} /></Field>
              <Field label="URL ของระบบ (สำหรับ QR Code)" hint="เช่น http://192.168.1.10:3093 หรือ https://assets.company.local — เว้นว่างเพื่อใช้ URL ที่เปิดอยู่">
                <input className="input mono" value={v.public_base_url} onChange={set('public_base_url')} placeholder="http://192.168.1.10:3093" />
              </Field>
            </div>
          </Card>
          <Card title="การเก็บ Log (PDPA)">
            <Field label="ระยะเวลาเก็บ Access Log และ Audit Trail (วัน)" hint="ช่วง 90–3650 วัน · log ที่เก่ากว่านี้จะถูกลบอัตโนมัติ เนื่องจากมีข้อมูลส่วนบุคคล (IP, ชื่อผู้ใช้)">
              <input type="number" className="input mono" value={v.log_retention_days} onChange={set('log_retention_days')} style={{ maxWidth: 160 }} />
            </Field>
          </Card>
        </div>
      </div>
    </form>
  );
}
