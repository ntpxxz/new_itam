import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Field, Chip } from '../components/ui.jsx';

export default function Profile() {
  const { user } = useAuth();
  const toast = useToast();
  const [v, setV] = useState({ current: '', next: '', confirm: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setV({ ...v, [k]: e.target.value }); setErr(''); };

  const submit = async (e) => {
    e.preventDefault();
    if (v.next !== v.confirm) return setErr('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
    setBusy(true);
    try {
      await api.post('/api/auth/change-password', v);
      toast.success('เปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นที่ล็อกอินไว้จะถูกออกจากระบบ');
      setV({ current: '', next: '', confirm: '' });
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  const strength = [v.next.length >= 8, /[A-Za-z]/.test(v.next), /\d/.test(v.next), /[^A-Za-z0-9]/.test(v.next)].filter(Boolean).length;

  return (
    <>
      <PageHeader title="บัญชีของฉัน" sub={`${user.full_name} · ${user.username}`} />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card title="เปลี่ยนรหัสผ่าน">
          <form onSubmit={submit} className="stack" style={{ gap: 14 }} noValidate>
            <Field label="รหัสผ่านปัจจุบัน" required><input type="password" className="input" value={v.current} onChange={set('current')} autoComplete="current-password" /></Field>
            <Field label="รหัสผ่านใหม่" required hint="อย่างน้อย 8 ตัว มีทั้งตัวอักษรและตัวเลข">
              <input type="password" className="input" value={v.next} onChange={set('next')} autoComplete="new-password" />
            </Field>
            {v.next && (
              <div className="row" style={{ gap: 6 }} aria-live="polite">
                {[0, 1, 2, 3].map((i) => <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < strength ? (strength >= 3 ? 'var(--success)' : 'var(--warning)') : 'var(--border)' }} />)}
                <span className="field-hint" style={{ minWidth: 60, textAlign: 'right' }}>{strength >= 4 ? 'แข็งแรง' : strength >= 3 ? 'ใช้ได้' : 'อ่อน'}</span>
              </div>
            )}
            <Field label="ยืนยันรหัสผ่านใหม่" required error={err || null}><input type="password" className="input" value={v.confirm} onChange={set('confirm')} autoComplete="new-password" /></Field>
            <div><button className="btn btn-primary" disabled={busy || !v.current || !v.next}>เปลี่ยนรหัสผ่าน</button></div>
          </form>
        </Card>
        <Card title="สิทธิ์ของฉัน">
          <p className="muted" style={{ marginBottom: 10, fontSize: 13 }}>บทบาท: <strong style={{ color: 'var(--text)' }}>{user.role_name}</strong></p>
          <div className="row-wrap">{user.permissions.map((p) => <Chip key={p} tone="neutral" dot={false}><span className="mono">{p}</span></Chip>)}</div>
        </Card>
      </div>
    </>
  );
}
