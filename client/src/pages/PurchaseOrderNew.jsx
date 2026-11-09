import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, FileText, FilePlus2 } from 'lucide-react';
import { api } from '../api.js';
import { useLookup } from '../hooks.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Empty, Loading, Field, Select } from '../components/ui.jsx';
import { fmtMoney, fmtNum, todayISO, who } from '../format.js';

// Pick approved รายการสั่งซื้อ lines (from any number of orders) and order them from one vendor as a new ใบสั่งซื้อ.
export default function PurchaseOrderNew() {
  const toast = useToast();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const fromOrder = Number(sp.get('order')) || null;
  const fromIds = new Set((sp.get('ids') || '').split(',').map(Number).filter(Boolean));
  const vendors = useLookup('vendors');
  const [rows, setRows] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [price, setPrice] = useState({});
  const [head, setHead] = useState({ vendor_id: '', doc_date: todayISO(), note: '' });
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/purchase-orders/available').then((d) => {
      setRows(d.rows);
      setPrice(Object.fromEntries(d.rows.map((r) => [r.id, r.unit_cost == null ? '' : String(r.unit_cost)])));
      if (fromOrder || fromIds.size) setPicked(new Set(d.rows.filter((r) => r.order_id === fromOrder || fromIds.has(r.id)).map((r) => r.id)));
    }).catch((e) => toast.error(e));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const term = q.trim().toLowerCase();
  const shown = useMemo(() => (rows || []).filter((r) => !term
    || [r.order_no, r.name, r.sku, r.person_name, r.department_name, r.category_name].some((v) => v && String(v).toLowerCase().includes(term))), [rows, term]);
  const chosen = (rows || []).filter((r) => picked.has(r.id));
  const units = chosen.reduce((s, r) => s + r.qty, 0);
  const total = chosen.reduce((s, r) => s + r.qty * (Number(price[r.id]) || 0), 0);
  const orders = new Set(chosen.map((r) => r.order_no)).size;
  const allShown = shown.length > 0 && shown.every((r) => picked.has(r.id));
  const toggle = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleShown = () => setPicked((p) => {
    const n = new Set(p);
    for (const r of shown) { if (allShown) n.delete(r.id); else n.add(r.id); }
    return n;
  });
  const set = (k) => (v) => setHead((h) => ({ ...h, [k]: v?.target ? v.target.value : v }));

  const submit = async () => {
    if (!head.vendor_id) { toast.error('กรุณาเลือกผู้ขาย'); return; }
    if (!chosen.length) { toast.error('กรุณาเลือกอย่างน้อย 1 รายการ'); return; }
    setBusy(true);
    try {
      const po = await api.post('/api/purchase-orders', { ...head, lines: chosen.map((r) => ({ id: r.id, unit_cost: price[r.id] })) });
      toast.success(`สร้างใบสั่งซื้อ ${po.po_no} แล้ว — รายการรอรับของที่เมนู “รอรับเข้า”`);
      navigate(`/purchase-orders/${po.id}`);
    } catch (e) { toast.error(e); setBusy(false); }
  };

  return (
    <>
      <PageHeader title="สร้างใบสั่งซื้อ" crumbs={[{ label: 'ใบสั่งซื้อ', to: '/purchase-orders' }, { label: 'สร้างใบสั่งซื้อ' }]}
        sub="เลือกสินค้าจากรายการสั่งซื้อที่อนุมัติแล้ว (เลือกข้ามใบได้) แล้วระบุผู้ขาย" />

      <div className="detail-grid">
        <Card title="รายการรอสั่งซื้อ" noBody>
          <div className="toolbar">
            <div className="input-icon">
              <Search size={16} aria-hidden />
              <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขที่รายการสั่งซื้อ, สินค้า, ผู้รับ" aria-label="ค้นหารายการ" />
            </div>
          </div>
          {!rows ? <div className="card-body"><Loading rows={6} /></div> : !rows.length ? (
            <div className="card-body">
              <Empty icon={FileText} title="ไม่มีรายการรอสั่งซื้อ">รายการมาจากรายการสั่งซื้อที่อนุมัติแล้วและยังไม่อยู่ในใบสั่งซื้อใด — <Link to="/orders?status=pending">ตรวจสอบรายการสั่งซื้อที่รออนุมัติ</Link></Empty>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input type="checkbox" className="check" checked={allShown} disabled={!shown.length} onChange={toggleShown} aria-label="เลือกทุกรายการที่แสดง" />
                    </th>
                    <th>รายการสั่งซื้อ</th><th>สินค้า</th><th className="text-right">จำนวน</th><th className="text-right">ราคา/หน่วย</th><th className="text-right">รวม</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const on = picked.has(r.id);
                    return (
                      <tr key={r.id}>
                        <td><input type="checkbox" className="check" checked={on} onChange={() => toggle(r.id)} aria-label={`เลือก ${r.name} จาก ${r.order_no}`} /></td>
                        <td className="nowrap">
                          <Link to={`/orders/${r.order_id}`} className="mono">{r.order_no}</Link>
                          <div className="cell-sub">{who(r.person_name, r.department_name) || '—'}</div>
                        </td>
                        <td>
                          <div className="cell-main">{r.name}</div>
                          <div className="cell-sub">{[r.category_name, r.brand, r.model].filter(Boolean).join(' · ')}{r.sku && <> · <span className="mono">{r.sku}</span></>}</div>
                        </td>
                        <td className="text-right nowrap"><span className="mono">{fmtNum(r.qty)}</span> {r.unit}</td>
                        <td className="text-right">
                          <input type="number" min="0" step="0.01" inputMode="decimal" className="input mono" style={{ width: 110, textAlign: 'right' }}
                            value={price[r.id] ?? ''} onChange={(e) => setPrice((p) => ({ ...p, [r.id]: e.target.value }))} disabled={!on} aria-label={`ราคาต่อหน่วย ${r.name}`} />
                        </td>
                        <td className="text-right mono">{on ? fmtMoney(r.qty * (Number(price[r.id]) || 0)) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="ข้อมูลใบสั่งซื้อ"
          foot={
            <div className="card-actions">
              <button className="btn btn-primary" onClick={submit} disabled={busy || !chosen.length}>
                <FilePlus2 size={16} />{busy ? 'กำลังสร้าง…' : `สร้างใบสั่งซื้อ · ${fmtNum(chosen.length)} รายการ`}
              </button>
            </div>
          }>
          <div className="stack" style={{ gap: 12 }}>
            <Field label="ผู้ขาย" required hint={vendors.length ? undefined : 'ยังไม่มีผู้ขาย — เพิ่มได้ที่ ข้อมูลหลัก › ผู้ขาย'}>
              <Select value={head.vendor_id} onChange={set('vendor_id')} options={vendors.map((v) => ({ value: v.id, label: v.name }))} />
            </Field>
            <Field label="วันที่ PO" required>
              <input type="date" className="input" value={head.doc_date} max={todayISO()} onChange={set('doc_date')} />
            </Field>
            <Field label="หมายเหตุ" hint="พิมพ์อยู่ในใบสั่งซื้อ เช่น เงื่อนไขการส่งของ">
              <textarea className="input" rows={2} value={head.note} onChange={set('note')} maxLength={500} />
            </Field>
            <dl className="dl">
              <dt>เลือกแล้ว</dt><dd><span className="mono">{fmtNum(chosen.length)}</span> รายการ · <span className="mono">{fmtNum(units)}</span> หน่วย{orders > 1 && ` · จาก ${orders} รายการสั่งซื้อ`}</dd>
              <dt>มูลค่ารวม</dt><dd><strong className="mono">{fmtMoney(total)}</strong></dd>
            </dl>
          </div>
        </Card>
      </div>
    </>
  );
}
