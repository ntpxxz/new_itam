import { useState } from 'react';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { useApi, clearLookupCache, useDebounced } from '../hooks.js';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from './Toast.jsx';
import { Card, Modal, Field, Select, Empty, Loading, Menu, Confirm } from './ui.jsx';

// Generic CRUD table for /api/master/:table
// columns: [{ key, label, render?, input?: 'text'|'select'|..., options?, required?, hint?, mono? }]
export default function MasterTable({ table, title, columns, addLabel = 'เพิ่ม', searchable, extraParams, showAdd = true }) {
  const { can } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, loading, reload } = useApi(`/api/master/${table}`, { ...extraParams, q: dq });
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const manage = can('master.manage');

  const save = async (row) => {
    try {
      if (row.id) await api.put(`/api/master/${table}/${row.id}`, row);
      else await api.post(`/api/master/${table}`, row);
      clearLookupCache();
      toast.success('บันทึกแล้ว');
      setEditing(null);
      reload();
    } catch (e) { toast.error(e); }
  };

  return (
    <Card title={title} noBody actions={(
      <>
        {searchable && (
          <div className="input-icon" style={{ width: 240 }}>
            <Search size={16} aria-hidden />
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา" aria-label={`ค้นหา${title}`} />
          </div>
        )}
        {manage && showAdd && <button className="btn btn-sm" onClick={() => setEditing({})}><Plus size={14} />{addLabel}</button>}
      </>
    )}>
      {loading && !data ? <Loading /> : !data?.rows.length ? <Empty title={q ? 'ไม่พบข้อมูลที่ค้นหา' : 'ยังไม่มีข้อมูล'} /> : (
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 560 }}>
            <thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}{manage && <th className="actions"><span className="sr-only">การทำงาน</span></th>}</tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  {columns.map((c, i) => (
                    <td key={c.key} className={c.mono ? 'mono' : i === 0 ? 'cell-main' : 'muted'}>{c.render ? c.render(r) : r[c.key] || '—'}</td>
                  ))}
                  {manage && (
                    <td className="actions">
                      <Menu items={[
                        { label: 'แก้ไข', onClick: () => setEditing(r), icon: <Pencil size={15} /> },
                        { label: 'ลบ', onClick: () => setDel(r), icon: <Trash2 size={15} />, danger: true },
                      ]} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <EditDialog title={`${editing.id ? 'แก้ไข' : addLabel}`} row={editing} columns={columns.filter((c) => c.input)} onSave={save} onClose={() => setEditing(null)} />}
      {del && (
        <Confirm title={`ลบ “${del.name}”?`} danger confirmLabel="ลบ" onClose={() => setDel(null)}
          message="ข้อมูลจะถูกซ่อนจากรายการเลือก แต่ประวัติที่อ้างอิงอยู่ยังคงแสดงผลได้"
          onConfirm={async () => { try { await api.del(`/api/master/${table}/${del.id}`); clearLookupCache(); toast.success('ลบแล้ว'); reload(); } catch (e) { toast.error(e); throw e; } }} />
      )}
    </Card>
  );
}

function EditDialog({ title, row, columns, onSave, onClose }) {
  const [v, setV] = useState(() => Object.fromEntries(columns.map((c) => [c.key, row[c.key] ?? c.default ?? ''])));
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await onSave({ ...v, id: row.id });
    setBusy(false);
  };
  return (
    <Modal title={title} onClose={onClose} footer={(
      <><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn btn-primary" type="submit" form="master-form" disabled={busy}>บันทึก</button></>
    )}>
      <form id="master-form" onSubmit={submit} className="stack" style={{ gap: 14 }} noValidate>
        {columns.map((c) => (
          <Field key={c.key} label={c.label} required={c.required} hint={c.hint}>
            {c.input === 'select' ? (
              <Select value={v[c.key]} onChange={(x) => setV({ ...v, [c.key]: x })} options={c.options} allowEmpty={!c.required} />
            ) : (
              <input className={`input${c.mono ? ' mono' : ''}`} type={c.input === 'email' ? 'email' : 'text'} value={v[c.key]}
                onChange={(e) => setV({ ...v, [c.key]: c.upper ? e.target.value.toUpperCase() : e.target.value })} maxLength={c.max || 200} />
            )}
          </Field>
        ))}
      </form>
    </Modal>
  );
}
