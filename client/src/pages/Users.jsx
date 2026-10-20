import { useState } from 'react';
import { Plus, Pencil, KeyRound, Unlock, UserX, UserCheck, Trash2 } from 'lucide-react';
import { useApi } from '../hooks.js';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Loading, Menu, Modal, Field, Select, Chip, Confirm } from '../components/ui.jsx';
import { fmtDateTime, initials, parse } from '../format.js';

export default function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useApi('/api/admin/users');
  const { data: roleData } = useApi('/api/admin/roles');
  const [edit, setEdit] = useState(null);
  const [reset, setReset] = useState(null);
  const [del, setDel] = useState(null);
  const roles = roleData?.roles || [];

  const update = async (u, patch, msg) => {
    try { await api.put(`/api/admin/users/${u.id}`, patch); toast.success(msg); reload(); } catch (e) { toast.error(e); }
  };

  return (
    <>
      <PageHeader title="ผู้ใช้งาน" sub="บัญชีที่เข้าสู่ระบบได้ · สิทธิ์กำหนดผ่านบทบาท">
        <button className="btn btn-primary" onClick={() => setEdit({})}><Plus size={16} />เพิ่มผู้ใช้</button>
      </PageHeader>
      <Card noBody>
        {loading && !data ? <Loading /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>ผู้ใช้</th><th>บทบาท</th><th>สถานะ</th><th>เข้าระบบล่าสุด</th><th className="actions"><span className="sr-only">การทำงาน</span></th></tr></thead>
              <tbody>
                {data?.rows.map((u) => {
                  const locked = u.locked_until && parse(u.locked_until) > new Date();
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="row" style={{ gap: 10 }}>
                          <span className="avatar" aria-hidden>{initials(u.full_name)}</span>
                          <div><div className="cell-main">{u.full_name}{u.id === me.id && <span className="muted"> (คุณ)</span>}</div><div className="tag">{u.username}{u.email && ` · ${u.email}`}</div></div>
                        </div>
                      </td>
                      <td><Chip tone="brand" dot={false}>{u.role_name}</Chip></td>
                      <td>{!u.is_active ? <Chip tone="neutral">ปิดใช้งาน</Chip> : locked ? <Chip tone="danger">ถูกล็อก</Chip> : <Chip tone="success">ใช้งานได้</Chip>}</td>
                      <td className="muted nowrap">{fmtDateTime(u.last_login_at)}</td>
                      <td className="actions">
                        <Menu items={[
                          { label: 'แก้ไข', onClick: () => setEdit(u), icon: <Pencil size={15} /> },
                          { label: 'ตั้งรหัสผ่านใหม่', onClick: () => setReset(u), icon: <KeyRound size={15} /> },
                          locked && { label: 'ปลดล็อกบัญชี', onClick: () => update(u, { unlock: true }, `ปลดล็อก ${u.username} แล้ว`), icon: <Unlock size={15} /> },
                          u.id !== me.id && (u.is_active
                            ? { label: 'ปิดใช้งาน', onClick: () => update(u, { is_active: false }, `ปิดใช้งาน ${u.username} แล้ว`), icon: <UserX size={15} /> }
                            : { label: 'เปิดใช้งาน', onClick: () => update(u, { is_active: true }, `เปิดใช้งาน ${u.username} แล้ว`), icon: <UserCheck size={15} /> }),
                          u.id !== me.id && '-',
                          u.id !== me.id && { label: 'ลบบัญชี', onClick: () => setDel(u), icon: <Trash2 size={15} />, danger: true },
                        ]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {edit && <UserDialog user={edit} roles={roles} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
      {reset && <ResetDialog user={reset} onClose={() => setReset(null)} />}
      {del && (
        <Confirm title={`ลบบัญชี ${del.username}?`} danger confirmLabel="ลบบัญชี" onClose={() => setDel(null)}
          message="ผู้ใช้จะเข้าสู่ระบบไม่ได้อีก ประวัติการทำรายการและ Log ยังถูกเก็บไว้"
          onConfirm={async () => { try { await api.del(`/api/admin/users/${del.id}`); toast.success('ลบบัญชีแล้ว'); reload(); } catch (e) { toast.error(e); throw e; } }} />
      )}
    </>
  );
}

function UserDialog({ user, roles, onClose, onDone }) {
  const toast = useToast();
  const isNew = !user.id;
  const [v, setV] = useState({ username: user.username || '', full_name: user.full_name || '', email: user.email || '', role_id: user.role_id || '', password: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (x) => setV((s) => ({ ...s, [k]: x?.target ? x.target.value : x }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (isNew) await api.post('/api/admin/users', v);
      else await api.put(`/api/admin/users/${user.id}`, { full_name: v.full_name, email: v.email, role_id: v.role_id });
      toast.success(isNew ? `สร้างบัญชี ${v.username} แล้ว` : 'บันทึกแล้ว');
      onDone();
    } catch (ex) { toast.error(ex); } finally { setBusy(false); }
  };
  return (
    <Modal title={isNew ? 'เพิ่มผู้ใช้' : `แก้ไข ${user.username}`} onClose={onClose} footer={(
      <><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn btn-primary" type="submit" form="user-form" disabled={busy}>บันทึก</button></>
    )}>
      <form id="user-form" onSubmit={submit} className="stack" style={{ gap: 14 }} noValidate>
        {isNew && <Field label="ชื่อผู้ใช้ (ใช้ล็อกอิน)" required hint="ภาษาอังกฤษ/ตัวเลข 3–32 ตัว"><input className="input mono" value={v.username} onChange={set('username')} autoCapitalize="none" /></Field>}
        <Field label="ชื่อ-นามสกุล" required><input className="input" value={v.full_name} onChange={set('full_name')} /></Field>
        <Field label="อีเมล"><input className="input" type="email" value={v.email} onChange={set('email')} /></Field>
        <Field label="บทบาท" required>
          <Select value={v.role_id} onChange={set('role_id')} options={roles.map((r) => ({ value: r.id, label: `${r.name} — ${r.description || ''}` }))} placeholder="— เลือกบทบาท —" />
        </Field>
        {isNew && <Field label="รหัสผ่านเริ่มต้น" required hint="อย่างน้อย 8 ตัว มีทั้งตัวอักษรและตัวเลข"><input className="input" type="text" value={v.password} onChange={set('password')} autoComplete="new-password" /></Field>}
      </form>
    </Modal>
  );
}

function ResetDialog({ user, onClose }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  return (
    <Modal title={`ตั้งรหัสผ่านใหม่ · ${user.username}`} onClose={onClose} footer={(
      <><button className="btn" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" onClick={async () => {
          try { await api.put(`/api/admin/users/${user.id}`, { password: pw }); toast.success('ตั้งรหัสผ่านใหม่แล้ว ผู้ใช้จะถูกออกจากระบบทุกอุปกรณ์'); onClose(); } catch (e) { toast.error(e); }
        }} disabled={!pw}>ตั้งรหัสผ่าน</button></>
    )}>
      <Field label="รหัสผ่านใหม่" hint="อย่างน้อย 8 ตัว มีทั้งตัวอักษรและตัวเลข · แจ้งผู้ใช้ให้เปลี่ยนหลังเข้าระบบ">
        <input className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
      </Field>
    </Modal>
  );
}
