import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ShoppingCart, Package, Laptop, Plus, Minus, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useDebounced } from '../hooks.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Field, Empty, Loading, Chip } from '../components/ui.jsx';
import RecipientFields from '../components/RecipientFields.jsx';
import { fmtNum } from '../format.js';

// สั่งเบิกสินค้า: pick registered, in-stock items into a cart and send the order for review.
const CART_KEY = 'itam.cart';
const loadCart = () => { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } };
const saveCart = (c) => { try { localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch { /* storage unavailable */ } };

export default function Shop() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [items, setItems] = useState(null);
  const [cart, setCart] = useState(loadCart);
  const [who, setWho] = useState({ person_name: user.full_name || '', department_name: '' });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const term = useDebounced(q);

  const load = () => api.get('/api/orders/catalog').then((d) => setItems(d.rows)).catch((e) => toast.error(e));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => saveCart(cart), [cart]);

  const byKey = useMemo(() => new Map((items || []).map((x) => [x.key, x])), [items]);
  const categories = useMemo(() => [...new Set((items || []).map((x) => x.category_name))], [items]);
  const shown = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (items || []).filter((x) => (!cat || x.category_name === cat)
      && (!t || [x.name, x.code, x.brand, x.model].some((v) => v && v.toLowerCase().includes(t))));
  }, [items, term, cat]);

  const inCart = (key) => cart.find((l) => l.key === key)?.qty || 0;
  const setQty = (item, qty, max = item.available) => setCart((c) => {
    const n = Math.max(0, Math.min(qty, max));
    if (!n) return c.filter((l) => l.key !== item.key);
    return c.some((l) => l.key === item.key) ? c.map((l) => (l.key === item.key ? { ...l, qty: n } : l)) : [...c, { key: item.key, qty: n }];
  });

  const lines = cart.map((l) => ({ ...l, item: byKey.get(l.key) }));
  const missing = items ? lines.filter((l) => !l.item || l.item.available < l.qty) : [];
  const units = lines.reduce((s, l) => s + l.qty, 0);

  const submit = async () => {
    if (!cart.length) { toast.error('ตะกร้าว่าง — เลือกสินค้าอย่างน้อย 1 รายการ'); return; }
    if (missing.length) { toast.error('บางรายการในตะกร้ามีไม่พอ — ปรับจำนวนหรือลบออกก่อน'); return; }
    setBusy(true);
    try {
      const body = {
        ...who, note,
        lines: lines.map(({ qty, item: x }) => ({ kind: x.kind, consumable_id: x.consumable_id, category_id: x.category_id, name: x.name, brand: x.brand, model: x.model, qty })),
      };
      const o = await api.post('/api/orders', body);
      setCart([]);
      toast.success(`ส่งคำสั่งเบิก ${o.order_no} แล้ว — รอผู้ดูแลตรวจสอบ`);
      navigate(`/orders/${o.id}`);
    } catch (e) { toast.error(e); load(); setBusy(false); }
  };

  return (
    <>
      <PageHeader title="สั่งเบิกสินค้า" sub="เลือกสินค้าที่มีในสต็อกใส่ตะกร้า แล้วกดส่งคำสั่งเบิก — ผู้ดูแลจะตรวจสอบและส่งมอบให้" />
      <div className="two-col shop-layout">
        <Card noBody>
          <div className="toolbar">
            <div className="input-icon">
              <Search size={16} aria-hidden />
              <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ, บาร์โค้ด, ยี่ห้อ, รุ่น" aria-label="ค้นหาสินค้า" />
            </div>
            <select className="select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="หมวดหมู่">
              <option value="">ทุกหมวดหมู่</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="card-body">
            {!items ? <Loading /> : !shown.length ? (
              <Empty icon={Package} title={items.length ? 'ไม่พบสินค้าที่ค้นหา' : 'ยังไม่มีสินค้าในสต็อก'}>
                {items.length ? 'ลองคำค้นอื่น หรือเลือก “ทุกหมวดหมู่”' : 'สินค้าต้องลงทะเบียนและรับเข้าสต็อกก่อนจึงจะสั่งเบิกได้'}
              </Empty>
            ) : (
              <div className="shop-grid">
                {shown.map((x) => {
                  const n = inCart(x.key);
                  const Icon = x.kind === 'asset' ? Laptop : Package;
                  return (
                    <div className="shop-item" key={x.key}>
                      <div className="shop-photo">{x.image_path ? <img src={x.image_path} alt="" loading="lazy" /> : <Icon size={28} aria-hidden />}</div>
                      <div className="cell-main shop-name">{x.name}</div>
                      <div className="cell-sub">{[x.category_name, x.brand, x.model].filter(Boolean).join(' · ')}</div>
                      {x.code && <div className="tag">{x.code}</div>}
                      <div className="row-wrap" style={{ marginTop: 'auto' }}>
                        {x.available > 0
                          ? <Chip tone="success">เบิกได้ <span className="mono">{fmtNum(x.available)}</span> {x.unit}</Chip>
                          : <Chip tone="neutral">หมดชั่วคราว</Chip>}
                      </div>
                      {n ? (
                        <QtyStepper value={n} max={x.available} unit={x.unit} label={x.name} onChange={(v) => setQty(x, v)} />
                      ) : (
                        <button className="btn btn-sm" onClick={() => setQty(x, 1)} disabled={!x.available}><Plus size={14} />ใส่ตะกร้า</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        <div className="stack shop-cart">
          <Card title={<span className="row" style={{ gap: 8 }}><ShoppingCart size={16} aria-hidden />ตะกร้า{cart.length ? ` (${cart.length})` : ''}</span>}
            foot={
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={submit} disabled={busy || !cart.length}>
                {busy ? 'กำลังส่ง…' : `ส่งคำสั่งเบิก${units ? ` · ${fmtNum(units)} หน่วย` : ''}`}
              </button>
            }>
            {!cart.length ? <p className="field-hint">ยังไม่มีสินค้า — กด “ใส่ตะกร้า” ที่สินค้าที่ต้องการ</p> : (
              <div className="stack" style={{ gap: 12 }}>
                {lines.map((l) => (
                  <div key={l.key} className="cart-line">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="cell-main">{l.item?.name || 'สินค้านี้ไม่มีในสต็อกแล้ว'}</div>
                      {l.item && l.item.available < l.qty && <div className="cell-sub danger-text">เหลือให้เบิก {fmtNum(l.item.available)} {l.item.unit} — ลดจำนวนลง</div>}
                      {l.item && <QtyStepper value={l.qty} max={Math.max(l.item.available, l.qty)} unit={l.item.unit} label={l.item.name} onChange={(v) => setQty(l.item, v, Math.max(l.item.available, l.qty))} />}
                    </div>
                    <button className="icon-btn plain" onClick={() => setCart((c) => c.filter((x) => x.key !== l.key))} aria-label={`ลบ ${l.item?.name || 'รายการ'} ออกจากตะกร้า`}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="ผู้รับ">
            <div className="stack" style={{ gap: 12 }}>
              <RecipientFields value={who} onChange={setWho} required={false} compact />
              <Field label="หมายเหตุ" hint="เช่น ใช้งานโครงการไหน หรือจุดที่ให้ส่งของ">
                <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              </Field>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function QtyStepper({ value, max, unit, label, onChange }) {
  return (
    <div className="qty-stepper">
      <button className="icon-btn" onClick={() => onChange(value - 1)} aria-label={`ลดจำนวน ${label}`}><Minus size={14} /></button>
      <input type="number" min="0" max={max} inputMode="numeric" className="input mono" value={value} aria-label={`จำนวน ${label}`}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)} />
      <button className="icon-btn" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`เพิ่มจำนวน ${label}`}><Plus size={14} /></button>
      <span className="cell-sub">{unit}</span>
    </div>
  );
}
