import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Search, ArrowRightLeft } from 'lucide-react';
import { useApi, clearLookupCache, useDebounced } from '../hooks.js';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from './Toast.jsx';
import { Card, Modal, Field, Select, Empty, Loading, Menu, Confirm } from './ui.jsx';

// Generic CRUD table for /api/master/:table
// columns: [{ key, label, render?, input?: 'text'|'select'|..., options?, required?, hint?, mono? }]
// selectable: checkbox column + bulk delete; bulkSet: { field, label, options, emptyLabel } adds "change <label>" for checked rows.
export default function MasterTable({ table, title, columns, addLabel = 'เพิ่ม', searchable, extraParams, showAdd = true, selectable, bulkSet }) {
  const { can } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, loading, reload } = useApi(`/api/master/${table}`, { ...extraParams, q: dq });
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const manage = can(table === 'people' ? 'people.manage' : 'master.manage');
  const [selected, setSelected] = useState(new Set());
  const [bulk, setBulk] = useState(null); // 'delete' | 'set'
  const checks = selectable && manage;
  const rows = data?.rows || [];

  // Keep only rows still visible after a search or reload.
  useEffect(() => {
    setSelected((s) => {
      const visible = new Set(rows.map((r) => r.id));
      const n = new Set([...s].filter((id) => visible.has(id)));
      return n.size === s.size ? s : n;
    });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));

  const runBulk = async (body, done) => {
    try {
      const { count } = await api.post(`/api/master/${table}/bulk`, { ids: [...selected], ...body });
      clearLookupCache();
      toast.success(`${done} ${count} รายการแล้ว`);
      setSelected(new Set());
      setBulk(null);
      reload();
    } catch (e) { toast.error(e); throw e; }
  };

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
      {checks && selected.size > 0 && (
        <div className="toolbar" style={{ paddingTop: 10, paddingBottom: 10 }}>
          <span className="muted" style={{ fontSize: 13 }}>เลือก <span className="mono">{selected.size}</span> รายการ</span>
          <span className="spacer" />
          {bulkSet && <button className="btn btn-sm" onClick={() => setBulk('set')}><ArrowRightLeft size={14} />เปลี่ยน{bulkSet.label}</button>}
          <button className="btn btn-sm btn-danger" onClick={() => setBulk('delete')}><Trash2 size={14} />ลบที่เลือก</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>ยกเลิกเลือก</button>
        </div>
      )}
      {loading && !data ? <Loading /> : !data?.rows.length ? <Empty title={q ? 'ไม่พบข้อมูลที่ค้นหา' : 'ยังไม่มีข้อมูล'} /> : (
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 560 }}>
            <thead><tr>
              {checks && (
                <th style={{ width: 40 }}>
                  <input type="checkbox" className="check" checked={allChecked} onChange={toggleAll} aria-label={`เลือก${title}ทั้งหมด`} />
                </th>
              )}
              {columns.map((c) => <th key={c.key}>{c.label}</th>)}{manage && <th className="actions"><span className="sr-only">การทำงาน</span></th>}</tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} aria-selected={checks ? selected.has(r.id) : undefined}>
                  {checks && (
                    <td><input type="checkbox" className="check" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`เลือก ${r.name}`} /></td>
                  )}
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
      {bulk === 'delete' && (
        <Confirm title={`ลบ ${selected.size} รายการที่เลือก?`} danger confirmLabel="ลบ" onClose={() => setBulk(null)}
          message="ข้อมูลจะถูกซ่อนจากรายการเลือก แต่ประวัติที่อ้างอิงอยู่ยังคงแสดงผลได้ หากมีรายการใดลบไม่ได้ ระบบจะไม่ลบรายการใดเลย"
          onConfirm={() => runBulk({ action: 'delete' }, 'ลบ')} />
      )}
      {bulk === 'set' && (
        <BulkSetDialog count={selected.size} def={bulkSet} onClose={() => setBulk(null)}
          onSave={(value) => runBulk({ action: 'set', field: bulkSet.field, value }, `เปลี่ยน${bulkSet.label}`)} />
      )}
      {del && (
        <Confirm title={`ลบ “${del.name}”?`} danger confirmLabel="ลบ" onClose={() => setDel(null)}
          message="ข้อมูลจะถูกซ่อนจากรายการเลือก แต่ประวัติที่อ้างอิงอยู่ยังคงแสดงผลได้"
          onConfirm={async () => { try { await api.del(`/api/master/${table}/${del.id}`); clearLookupCache(); toast.success('ลบแล้ว'); reload(); } catch (e) { toast.error(e); throw e; } }} />
      )}
    </Card>
  );
}

function BulkSetDialog({ count, def, onSave, onClose }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await onSave(value); } catch { setBusy(false); }
  };
  return (
    <Modal title={`เปลี่ยน${def.label} ${count} รายการ`} onClose={onClose} footer={(
      <><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn btn-primary" type="submit" form="bulk-form" disabled={busy}>บันทึก</button></>
    )}>
      <form id="bulk-form" onSubmit={submit} className="stack" style={{ gap: 14 }} noValidate>
        <Field label={`${def.label}ใหม่`} hint={`ใช้กับทั้ง ${count} รายการที่เลือก`}>
          <Select value={value} onChange={setValue} options={def.options} placeholder={def.emptyLabel || '— ไม่ระบุ —'} />
        </Field>
      </form>
    </Modal>
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
