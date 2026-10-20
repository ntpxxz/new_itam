import { Fragment, useEffect, useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { useApi } from '../hooks.js';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Loading, Modal, Field, Confirm } from '../components/ui.jsx';

export default function Roles() {
  const toast = useToast();
  const { data, loading, reload } = useApi('/api/admin/roles');
  const [matrix, setMatrix] = useState({});
  const [dirty, setDirty] = useState(false);
  const [creating, setCreating] = useState(false);
  const [del, setDel] = useState(null);

  useEffect(() => {
    if (data) {
      setMatrix(Object.fromEntries(data.roles.map((r) => [r.id, new Set(r.permissions)])));
      setDirty(false);
    }
  }, [data]);

  if (loading && !data) return <Card><Loading rows={10} /></Card>;
  if (!data) return null;
  const { roles, permissions } = data;
  const groups = [...new Set(permissions.map((p) => p.grp))];

  const toggle = (roleId, key) => {
    setMatrix((m) => {
      const s = new Set(m[roleId]);
      s.has(key) ? s.delete(key) : s.add(key);
      return { ...m, [roleId]: s };
    });
    setDirty(true);
  };

  const saveAll = async () => {
    try {
      for (const r of roles) {
        const next = [...matrix[r.id]].sort();
        if (next.join() !== [...r.permissions].sort().join()) await api.put(`/api/admin/roles/${r.id}`, { permissions: next });
      }
      toast.success('บันทึกสิทธิ์แล้ว — มีผลทันทีกับผู้ใช้ทุกคน');
      reload();
    } catch (e) { toast.error(e); }
  };

  return (
    <>
      <PageHeader title="บทบาทและสิทธิ์" sub="สิทธิ์ย่อยผูกกับบทบาท — ปรับได้ภายหลังโดยไม่ต้องแก้โค้ด">
        <button className="btn" onClick={() => setCreating(true)}><Plus size={16} />เพิ่มบทบาท</button>
        <button className="btn btn-primary" onClick={saveAll} disabled={!dirty}><Save size={16} />บันทึกการเปลี่ยนแปลง</button>
      </PageHeader>
      <Card noBody>
        <div className="table-wrap">
          <table className="table matrix">
            <thead>
              <tr>
                <th>สิทธิ์</th>
                {roles.map((r) => (
                  <th key={r.id}>
                    <div className="row" style={{ justifyContent: 'center', gap: 4 }}>
                      {r.name}
                      {!r.is_system && <button className="icon-btn plain" style={{ width: 24, height: 24 }} onClick={() => setDel(r)} aria-label={`ลบบทบาท ${r.name}`}><Trash2 size={12} /></button>}
                    </div>
                    <div className="cell-sub" style={{ fontWeight: 400 }}>{r.user_count} ผู้ใช้</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g}>
                  <tr className="grp"><td colSpan={roles.length + 1}>{g}</td></tr>
                  {permissions.filter((p) => p.grp === g).map((p) => (
                    <tr key={p.key}>
                      <td><div>{p.name}</div><div className="tag">{p.key}</div></td>
                      {roles.map((r) => {
                        const locked = r.key === 'admin' && ['user.manage', 'role.manage'].includes(p.key);
                        return (
                          <td key={r.id}>
                            <input type="checkbox" className="check" checked={matrix[r.id]?.has(p.key) || false} disabled={locked}
                              onChange={() => toggle(r.id, p.key)} aria-label={`${r.name}: ${p.name}`} style={{ width: 18, height: 18, accentColor: 'var(--brand)' }} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {creating && <NewRole onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
      {del && (
        <Confirm title={`ลบบทบาท ${del.name}?`} danger confirmLabel="ลบ" onClose={() => setDel(null)} message="ลบได้เฉพาะบทบาทที่ไม่มีผู้ใช้"
          onConfirm={async () => { try { await api.del(`/api/admin/roles/${del.id}`); toast.success('ลบบทบาทแล้ว'); reload(); } catch (e) { toast.error(e); throw e; } }} />
      )}
    </>
  );
}

function NewRole({ onClose, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({ name: '', description: '' });
  return (
    <Modal title="เพิ่มบทบาท" onClose={onClose} footer={(
      <><button className="btn" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={!v.name.trim()} onClick={async () => {
          try { await api.post('/api/admin/roles', { ...v, permissions: ['dashboard.view', 'asset.view'] }); toast.success('เพิ่มบทบาทแล้ว — กำหนดสิทธิ์ในตาราง'); onDone(); } catch (e) { toast.error(e); }
        }}>เพิ่ม</button></>
    )}>
      <Field label="ชื่อบทบาท" required><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="เช่น หัวหน้าแผนก" /></Field>
      <Field label="คำอธิบาย"><input className="input" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
    </Modal>
  );
}
