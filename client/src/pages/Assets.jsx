import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Search, Download, Upload, Laptop, Package, Eye, Pencil, Printer, Trash2, X, ShieldAlert, PackageMinus, PackagePlus,
} from 'lucide-react';
import { useApi, useLookup, useQueryState, useDebounced } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { api, download } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import {
  PageHeader, StatusChip, Pagination, Empty, Loading, Menu, Select, SortHeader, Confirm, CategorySelect, STATUS, KIND_LABEL,
} from '../components/ui.jsx';
import { MoveDialog } from '../components/ConsumableDialogs.jsx';
import { fmtDate, daysFromToday, fmtMoney, fmtNum, who } from '../format.js';

const FILTERS = [
  ['available', STATUS.available], ['borrowed', STATUS.borrowed], ['issued', STATUS.issued], ['repair', STATUS.repair],
  ['pending_disposal', STATUS.pending_disposal], ['scrapped', STATUS.scrapped], ['low', 'สต็อกต่ำ'],
];

const detailUrl = (r) => (r.kind === 'asset' ? `/assets/${r.id}` : `/consumables/${r.id}`);

export default function Assets() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useQueryState({ q: '', status: '', category_id: '', location_id: '', page: 1, sort: 'updated_at', dir: 'desc', warranty: '' });
  const [q, setQ] = useState(f.q);
  const dq = useDebounced(q);
  useEffect(() => { if (dq !== f.q) setF({ q: dq }); }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setQ(f.q); }, [f.q]);

  const [selected, setSelected] = useState(new Set());
  const [confirmDel, setConfirmDel] = useState(null);
  const [move, setMove] = useState(null);
  const cats = useLookup('categories');
  const locs = useLookup('locations');
  const { data, loading, reload } = useApi('/api/items', { ...f, pageSize: 20 });

  const assetRows = data?.rows.filter((r) => r.kind === 'asset') || [];
  const allOnPage = assetRows.length > 0 && assetRows.every((r) => selected.has(r.id));
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    assetRows.forEach((r) => (allOnPage ? n.delete(r.id) : n.add(r.id)));
    return n;
  });
  const filtered = f.q || f.status || f.category_id || f.location_id || f.warranty;
  const counts = data?.counts || {};
  const countOf = (k) => (k === 'low' ? (counts.low_stock || 0) + (counts.out_of_stock || 0) : counts[k] || 0);
  const canAdd = can('asset.create') || can('consumable.manage');

  const remove = async (r) => {
    try {
      await api.del(r.kind === 'asset' ? `/api/assets/${r.id}` : `/api/consumables/${r.id}`);
      toast.success(`ลบ ${r.code} แล้ว (เก็บประวัติไว้ในระบบ)`);
      reload();
    } catch (e) { toast.error(e); throw e; }
  };

  return (
    <>
      <PageHeader title="อุปกรณ์" sub="ทะเบียนอุปกรณ์ไอทีทั้งหมด — หมวดหมู่กำหนดว่าติดตามแบบรายชิ้นหรือนับจำนวน">
        {can('data.import') && <Link to="/import" className="btn"><Upload size={16} />นำเข้า Excel</Link>}
        {can('report.export') && (
          <button className="btn" onClick={() => download('/api/items/export', { category_id: f.category_id })}><Download size={16} />ส่งออก Excel</button>
        )}
        {canAdd && <Link to={`/assets/new${f.category_id ? `?category_id=${f.category_id}` : ''}`} className="btn btn-primary"><Plus size={16} />เพิ่มอุปกรณ์</Link>}
      </PageHeader>

      <section className="card">
        <div className="toolbar">
          <div className="input-icon">
            <Search size={16} aria-hidden />
            <input className="input" type="search" placeholder="ค้นหารหัส, ชื่อ, Serial, ยี่ห้อ, ผู้ถือครอง" value={q}
              onChange={(e) => setQ(e.target.value)} aria-label="ค้นหาอุปกรณ์" />
          </div>
          <CategorySelect value={f.category_id} onChange={(v) => setF({ category_id: v })} categories={cats} placeholder="ทุกหมวดหมู่"
            aria-label="กรองตามหมวดหมู่" style={{ width: 'auto', minWidth: 160 }} />
          <Select value={f.location_id} onChange={(v) => setF({ location_id: v })} placeholder="ทุกสถานที่"
            options={locs.map((l) => ({ value: l.id, label: l.name }))} aria-label="กรองตามสถานที่" />
          {filtered && (
            <button className="btn btn-ghost" onClick={() => { setQ(''); setF({ q: '', status: '', category_id: '', location_id: '', warranty: '' }); }}>
              <X size={14} />ล้างตัวกรอง
            </button>
          )}
        </div>
        <div className="toolbar" style={{ paddingTop: 10, paddingBottom: 10 }}>
          <div className="seg" role="group" aria-label="กรองตามสถานะ">
            <button aria-pressed={!f.status} onClick={() => setF({ status: '' })}>ทั้งหมด</button>
            {FILTERS.map(([k, label]) => (
              <button key={k} aria-pressed={f.status === k} onClick={() => setF({ status: k })}>
                {label}<span className="count">{fmtNum(countOf(k))}</span>
              </button>
            ))}
          </div>
          {f.warranty === '1' && <span className="chip chip-warning"><ShieldAlert size={12} />ประกันใกล้หมด</span>}
          <span className="spacer" />
          {selected.size > 0 && (
            <div className="row">
              <span className="muted" style={{ fontSize: 13 }}>เลือก <span className="mono">{selected.size}</span> รายการ</span>
              <button className="btn btn-sm" onClick={() => navigate(`/labels?ids=${[...selected].join(',')}`)}><Printer size={14} />พิมพ์สติ๊กเกอร์</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>ยกเลิกเลือก</button>
            </div>
          )}
        </div>

        {loading && !data ? <Loading rows={8} /> : !data?.rows.length ? (
          <Empty icon={Laptop} title={filtered ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีอุปกรณ์ในระบบ'}>
            {filtered ? 'ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง' : canAdd && <Link to="/assets/new">เพิ่มอุปกรณ์ชิ้นแรก →</Link>}
          </Empty>
        ) : (
          <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input type="checkbox" className="check" checked={allOnPage} onChange={toggleAll} disabled={!assetRows.length}
                      aria-label="เลือกอุปกรณ์รายชิ้นทั้งหน้า" />
                  </th>
                  <SortHeader label="รายการ" field="name" sort={f.sort} dir={f.dir} onSort={(sort, dir) => setF({ sort, dir })} />
                  <th>หมวดหมู่</th>
                  <SortHeader label="สถานะ" field="status" sort={f.sort} dir={f.dir} onSort={(sort, dir) => setF({ sort, dir })} />
                  <th>ผู้ถือครอง / คงเหลือ</th>
                  <SortHeader label="หมดประกัน" field="warranty_expiry" sort={f.sort} dir={f.dir} onSort={(sort, dir) => setF({ sort, dir })} />
                  <SortHeader label="ราคา" field="price" sort={f.sort} dir={f.dir} onSort={(sort, dir) => setF({ sort, dir })} />
                  <th className="actions"><span className="sr-only">การทำงาน</span></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (r.kind === 'asset'
                  ? <AssetRow key={`a${r.id}`} r={r} can={can} selected={selected.has(r.id)} onToggle={() => toggle(r.id)} onOpen={() => navigate(detailUrl(r))} onDelete={() => setConfirmDel(r)} />
                  : <StockRow key={`c${r.id}`} r={r} can={can} onOpen={() => navigate(detailUrl(r))} onMove={(type) => setMove({ item: r, type })} onDelete={() => setConfirmDel(r)} />))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={Number(f.page)} pageSize={data.pageSize} total={data.total} onPage={(page) => setF({ page })} />}
      </section>

      {move && (
        <MoveDialog item={{ ...move.item, sku: move.item.code, unit_cost: move.item.price }} type={move.type}
          onClose={() => setMove(null)} onDone={() => { setMove(null); reload(); }} />
      )}
      {confirmDel && (
        <Confirm title={`ลบ ${confirmDel.code}?`} danger confirmLabel="ลบ"
          message={confirmDel.kind === 'asset'
            ? `"${confirmDel.name}" จะถูกซ่อนจากทะเบียน แต่ประวัติและ Audit Trail ยังถูกเก็บไว้ หากต้องการจำหน่ายจริงให้ใช้ "ส่งรอจำหน่าย" แทน`
            : `"${confirmDel.name}" จะถูกซ่อนจากทะเบียน แต่ประวัติการรับเข้า-เบิกยังถูกเก็บไว้`}
          onConfirm={() => remove(confirmDel)} onClose={() => setConfirmDel(null)} />
      )}
    </>
  );
}

function CategoryCell({ r }) {
  return (
    <td>
      <div className="muted">{r.category_name}</div>
      <div className="cell-sub">{KIND_LABEL[r.kind]}</div>
    </td>
  );
}

function AssetRow({ r, can, selected, onToggle, onOpen, onDelete }) {
  const overdue = r.status === 'borrowed' && daysFromToday(r.due_date) < 0;
  const wd = daysFromToday(r.warranty_expiry);
  const deletable = can('asset.delete') && !['borrowed', 'issued', 'repair'].includes(r.status);
  return (
    <tr className="clickable" onClick={onOpen}>
      <td onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" className="check" checked={selected} onChange={onToggle} aria-label={`เลือก ${r.code}`} />
      </td>
      <td>
        <div className="row" style={{ gap: 10 }}>
          <span className="thumb">{r.image_path ? <img src={r.image_path} alt="" loading="lazy" /> : <Laptop size={16} />}</span>
          <div style={{ minWidth: 0 }}>
            <Link to={`/assets/${r.id}`} className="cell-main" onClick={(e) => e.stopPropagation()}>{r.name}</Link>
            <div className="tag">{r.code}{r.serial_no && <span> · SN {r.serial_no}</span>}</div>
          </div>
        </div>
      </td>
      <CategoryCell r={r} />
      <td>
        <StatusChip status={r.status} />
        {overdue && <div className="cell-sub danger-text" style={{ marginTop: 4 }}>เกินกำหนด {Math.abs(daysFromToday(r.due_date))} วัน</div>}
      </td>
      <td>
        {r.holder_name || r.holder_section ? <><div>{who(r.holder_name, r.holder_section)}</div><div className="cell-sub">{r.department_name}</div></> : <span className="muted">{r.location_name || '—'}</span>}
      </td>
      <td className="nowrap">
        {r.warranty_expiry ? <span className={wd < 0 ? 'subtle' : wd <= 30 ? 'danger-text' : ''}>{fmtDate(r.warranty_expiry)}</span> : <span className="subtle">—</span>}
      </td>
      <td className="mono nowrap">{fmtMoney(r.price)}</td>
      <td className="actions">
        <Menu items={[
          { label: 'ดูรายละเอียด', to: `/assets/${r.id}`, icon: <Eye size={15} /> },
          can('asset.edit') && r.status !== 'scrapped' && { label: 'แก้ไข', to: `/assets/${r.id}/edit`, icon: <Pencil size={15} /> },
          { label: 'พิมพ์สติ๊กเกอร์', to: `/labels?ids=${r.id}`, icon: <Printer size={15} /> },
          deletable && '-',
          deletable && { label: 'ลบ', onClick: onDelete, icon: <Trash2 size={15} />, danger: true },
        ]} />
      </td>
    </tr>
  );
}

function StockRow({ r, can, onOpen, onMove, onDelete }) {
  const low = r.status !== 'in_stock';
  const pct = Math.min(100, (r.qty_on_hand / Math.max(1, r.reorder_point * 3)) * 100);
  return (
    <tr className="clickable" onClick={onOpen}>
      <td />
      <td>
        <div className="row" style={{ gap: 10 }}>
          <span className="thumb"><Package size={16} /></span>
          <div style={{ minWidth: 0 }}>
            <Link to={`/consumables/${r.id}`} className="cell-main" onClick={(e) => e.stopPropagation()}>{r.name}</Link>
            <div className="tag">{r.code}</div>
          </div>
        </div>
      </td>
      <CategoryCell r={r} />
      <td><StatusChip status={r.status} /></td>
      <td>
        <div className="row" style={{ gap: 10 }}>
          <span className="nowrap"><span className="mono" style={{ fontWeight: 600 }}>{fmtNum(r.qty_on_hand)}</span> <span className="muted">{r.unit}</span></span>
          <div className={`stock-bar${low ? ' low' : ''}`} aria-hidden><span style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="cell-sub">จุดสั่งซื้อ {fmtNum(r.reorder_point)}</div>
      </td>
      <td><span className="subtle">—</span></td>
      <td className="mono nowrap">{fmtMoney(r.price)}<span className="cell-sub"> /{r.unit}</span></td>
      <td className="actions" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
          {can('consumable.move') && (
            <button className="btn btn-sm" onClick={() => onMove('out')} disabled={r.qty_on_hand === 0}><PackageMinus size={14} />เบิก</button>
          )}
          <Menu items={[
            { label: 'ดูรายละเอียด', to: `/consumables/${r.id}`, icon: <Eye size={15} /> },
            can('consumable.move') && { label: 'รับเข้า', onClick: () => onMove('in'), icon: <PackagePlus size={15} /> },
            can('consumable.manage') && '-',
            can('consumable.manage') && { label: 'ลบ', onClick: onDelete, icon: <Trash2 size={15} />, danger: true },
          ]} />
        </div>
      </td>
    </tr>
  );
}
