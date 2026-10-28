import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Boxes, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { Field } from '../components/ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
      const next = sp.get('next');
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true });
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-form-wrap">
        <form className="login-form" onSubmit={submit} noValidate>
          <div className="login-brand">
            <span className="brand-mark"><Boxes size={18} aria-hidden /></span>
            <span className="brand-name">IT Store</span>
          </div>
          <div>
            <h1 className="page-title">เข้าสู่ระบบ</h1>
            <p className="page-sub">ใช้บัญชีที่ได้รับจากผู้ดูแลระบบ</p>
          </div>
          {error && (
            <div className="alert danger" role="alert"><AlertCircle size={18} /><span>{error}</span></div>
          )}
          <Field label="ชื่อผู้ใช้">
            <input className="input" autoComplete="username" autoCapitalize="none" value={username}
              onChange={(e) => setUsername(e.target.value)} autoFocus required />
          </Field>
          <Field label="รหัสผ่าน">
            <div style={{ position: 'relative' }}>
              <input className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} required style={{ paddingRight: 44 }} />
              <button type="button" className="icon-btn plain" onClick={() => setShow((s) => !s)}
                aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} style={{ position: 'absolute', right: 2, top: 1 }}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy || !username || !password}>
            {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
          <p className="field-hint" style={{ textAlign: 'center' }}>
            ใส่รหัสผิดหลายครั้งบัญชีจะถูกล็อกชั่วคราว · ลืมรหัสผ่านติดต่อแผนกไอที
          </p>
        </form>
      </div>
    </div>
  );
}
