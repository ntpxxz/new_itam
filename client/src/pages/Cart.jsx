import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Package, Laptop, Trash2, ArrowLeft, AlertTriangle } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useCart, setCart, setLineQty, clearCart, maxQty } from '../cart.js';
import { useToast } from '../components/Toast.jsx';
import Photo from '../components/Photo.jsx';
import { PageHeader, Card, Field, Empty, Loading, Confirm } from '../components/ui.jsx';
import RecipientFields from '../components/RecipientFields.jsx';
import QtyStepper from '../components/QtyStepper.jsx';
import { fmtNum, fmtMoney } from '../format.js';

// ตะกร้า: review the cart, set the recipient and send the purchase order. Stock level doesn't limit quantities.
export default function Cart() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const cart = useCart();
  const [items, setItems] = useState(null);
  const [who, setWho] = useState({ person_name: user.full_name || '', department_name: '' });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);

  const load = () => api.get('/api/orders/catalog').then((d) => setItems(d.rows)).catch((e) => toast.error(e));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const byKey = useMemo(() => new Map((items || []).map((x) => [x.key, x])), [items]);
  const lines = cart.map((l) => ({ ...l, item: byKey.get(l.key) }));
  const gone = items ? lines.filter((l) => !l.item) : [];
  const units = cart.reduce((s, l) => s + l.qty, 0);
  const estimate = lines.reduce((s, l) => s + l.qty * (Number(l.item?.last_price) || 0), 0);
  const remove = (key) => setCart((c) => c.filter((l) => l.key !== key));

  const submit = async () => {
    if (gone.length) { toast.error('บางรายการไม่มีในระบบแล้ว — ลบออกจากตะกร้าก่อน'); return; }
    setBusy(true);
    try {
      const o = await api.post('/api/orders', {
        ...who, note,
        lines: lines.map(({ qty, item: x }) => ({ kind: x.kind, consumable_id: x.consumable_id, category_id: x.category_id, name: x.name, brand: x.brand, model: x.model, qty })),
      });
      clearCart();
      toast.success(`ส่งใบสั่งซื้อ ${o.order_no} แล้ว — รอผู้ดูแลอนุมัติ`);
      navigate(`/orders/${o.id}`);
    } catch (e) { toast.error(e); load(); setBusy(false); }
  };

  return (
    <>
      <PageHeader title="ตะกร้า" crumbs={[{ label: 'สั่งซื้อสินค้า', to: '/shop' }, { label: 'ตะกร้า' }]}
        sub="ตรวจรายการและจำนวน ระบุผู้รับ แล้วกดส่งใบสั่งซื้อ">
        <Link to="/shop" className="btn btn-ghost"><ArrowLeft size={16} />เลือกสินค้าต่อ</Link>
      </PageHeader>

      {!cart.length ? (
        <Card>
          <Empty icon={ShoppingCart} title="ตะกร้าว่าง">
            <Link to="/shop">ไปเลือกสินค้า</Link> แล้วกด “ใส่ตะกร้า”
          </Empty>
        </Card>
      ) : (
        <div className="two-col shop-layout">
          <Card title={`รายการ (${cart.length})`} noBody
            actions={<button className="btn btn-sm btn-ghost" onClick={() => setClearing(true)}><Trash2 size={14} />ล้างตะกร้า</button>}>
            {gone.length > 0 && (
              <div className="card-body" style={{ paddingBottom: 0 }}>
                <div className="alert danger">
                  <AlertTriangle size={18} />
                  <span className="alert-detail"><strong>{gone.length} รายการไม่มีในระบบแล้ว</strong> — ลบรายการที่ขึ้นสีแดงออกก่อนส่งใบสั่งซื้อ</span>
                </div>
              </div>
            )}
            {!items ? <div className="card-body"><Loading /></div> : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>สินค้า</th><th className="text-right">คงเหลือ</th><th>จำนวน</th><th className="text-right">ราคาล่าสุด</th>
                      <th style={{ width: 44 }}><span className="sr-only">ลบ</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(({ key, qty, item: x }) => {
                      const Icon = x?.kind === 'asset' ? Laptop : Package;
                      return (
                        <tr key={key}>
                          <td>
                            <div className="row" style={{ gap: 10 }}>
                              <Photo src={x?.image_path} alt={x?.name} icon={Icon} />
                              <div style={{ minWidth: 0 }}>
                                <div className={x ? 'cell-main' : 'cell-main danger-text'}>{x?.name || 'สินค้านี้ไม่มีในระบบแล้ว'}</div>
                                {x && <div className="cell-sub">{[x.category_name, x.brand, x.model].filter(Boolean).join(' · ')}{x.code && <> · <span className="mono">{x.code}</span></>}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="text-right nowrap">{x ? <><span className="mono">{fmtNum(x.on_hand)}</span> {x.unit}</> : '—'}</td>
                          <td>
                            {x && <QtyStepper value={qty} max={maxQty(x)} unit={x.unit} label={x.name} onChange={(v) => setLineQty(key, v, maxQty(x))} />}
                          </td>
                          <td className="text-right mono">{fmtMoney(x?.last_price)}</td>
                          <td>
                            <button className="icon-btn plain" onClick={() => remove(key)} aria-label={`ลบ ${x?.name || 'รายการ'} ออกจากตะกร้า`} title="ลบ">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {items && estimate > 0 && (
              <div className="card-body">
                <div className="line-summary" style={{ marginTop: 0 }}>
                  <span>รวม <strong className="mono">{fmtNum(units)}</strong> หน่วย</span>
                  <span className="spacer" />
                  <span>ประมาณการตามราคาล่าสุด <strong className="mono">{fmtMoney(estimate)}</strong></span>
                </div>
              </div>
            )}
          </Card>

          <div className="stack shop-cart">
            <Card title="ผู้รับ"
              foot={
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={submit} disabled={busy || !items || gone.length > 0}>
                  {busy ? 'กำลังส่ง…' : `ส่งใบสั่งซื้อ · ${fmtNum(units)} หน่วย`}
                </button>
              }>
              <div className="stack" style={{ gap: 12 }}>
                <RecipientFields value={who} onChange={setWho} required={false} compact />
                <Field label="หมายเหตุ" hint="เช่น เหตุผลที่สั่ง ใช้งานโครงการไหน หรือร้านที่แนะนำ">
                  <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
                </Field>
              </div>
            </Card>
          </div>
        </div>
      )}

      {clearing && (
        <Confirm title="ล้างตะกร้า" danger confirmLabel="ล้างตะกร้า" message={`ลบสินค้าทั้ง ${cart.length} รายการออกจากตะกร้า`}
          onConfirm={clearCart} onClose={() => setClearing(false)} />
      )}
    </>
  );
}
