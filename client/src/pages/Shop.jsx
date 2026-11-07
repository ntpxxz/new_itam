import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ShoppingCart, Package, Laptop, Plus, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useDebounced } from '../hooks.js';
import { useCart, setCart, setLineQty, maxQty } from '../cart.js';
import { useToast } from '../components/Toast.jsx';
import Photo from '../components/Photo.jsx';
import { PageHeader, Card, Empty, Loading, Chip } from '../components/ui.jsx';
import QtyStepper from '../components/QtyStepper.jsx';
import { fmtNum, fmtMoney } from '../format.js';

// สั่งซื้อสินค้า: pick any registered item into the cart (stock level doesn't matter); checkout happens on /cart.
export default function Shop() {
  const toast = useToast();
  const cart = useCart();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [items, setItems] = useState(null);
  const term = useDebounced(q);

  useEffect(() => {
    api.get('/api/orders/catalog').then((d) => setItems(d.rows)).catch((e) => toast.error(e));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const byKey = useMemo(() => new Map((items || []).map((x) => [x.key, x])), [items]);
  const categories = useMemo(() => [...new Set((items || []).map((x) => x.category_name))], [items]);
  const shown = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (items || []).filter((x) => (!cat || x.category_name === cat)
      && (!t || [x.name, x.code, x.brand, x.model].some((v) => v && v.toLowerCase().includes(t))));
  }, [items, term, cat]);

  const inCart = (key) => cart.find((l) => l.key === key)?.qty || 0;
  const units = cart.reduce((s, l) => s + l.qty, 0);

  return (
    <>
      <PageHeader title="สั่งซื้อสินค้า" sub="เลือกสินค้าที่ลงทะเบียนไว้ใส่ตะกร้า (สั่งได้แม้สต็อกเป็น 0) แล้วไปที่ตะกร้าเพื่อส่งใบสั่งซื้อ — ผู้ดูแลจะอนุมัติ รับของ และส่งมอบให้">
        <Link to="/cart" className="btn btn-primary"><ShoppingCart size={16} />ดูตะกร้า{cart.length ? ` (${cart.length})` : ''}</Link>
      </PageHeader>
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
              <Empty icon={Package} title={items.length ? 'ไม่พบสินค้าที่ค้นหา' : 'ยังไม่มีสินค้าในระบบ'}>
                {items.length ? 'ลองคำค้นอื่น หรือเลือก “ทุกหมวดหมู่”' : 'สินค้าต้องลงทะเบียนในระบบก่อนจึงจะสั่งซื้อได้'}
              </Empty>
            ) : (
              <div className="shop-grid">
                {shown.map((x) => {
                  const n = inCart(x.key);
                  const Icon = x.kind === 'asset' ? Laptop : Package;
                  return (
                    <div className="shop-item" key={x.key}>
                      <Photo src={x.image_path} alt={x.name} icon={Icon} iconSize={28} className="shop-photo" />
                      <div className="cell-main shop-name">{x.name}</div>
                      <div className="cell-sub">{[x.category_name, x.brand, x.model].filter(Boolean).join(' · ')}</div>
                      {x.code && <div className="tag">{x.code}</div>}
                      <div className="row-wrap" style={{ marginTop: 'auto' }}>
                        <Chip tone={x.on_hand > 0 ? 'success' : 'neutral'}>คงเหลือ <span className="mono">{fmtNum(x.on_hand)}</span> {x.unit}</Chip>
                        {x.last_price != null && <span className="cell-sub mono">{fmtMoney(x.last_price)}</span>}
                      </div>
                      {n ? (
                        <QtyStepper value={n} max={maxQty(x)} unit={x.unit} label={x.name} onChange={(v) => setLineQty(x.key, v, maxQty(x))} />
                      ) : (
                        <button className="btn btn-sm" onClick={() => setLineQty(x.key, 1, maxQty(x))}><Plus size={14} />ใส่ตะกร้า</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        <div className="shop-cart">
          <Card title={<span className="row" style={{ gap: 8 }}><ShoppingCart size={16} aria-hidden />ตะกร้า{cart.length ? ` (${cart.length})` : ''}</span>}
            foot={cart.length > 0 && <Link to="/cart" className="btn" style={{ width: '100%' }}>ไปที่ตะกร้า · {fmtNum(units)} หน่วย</Link>}>
            {!cart.length ? <p className="field-hint">ยังไม่มีสินค้า — กด “ใส่ตะกร้า” ที่สินค้าที่ต้องการ</p> : (
              <div className="stack" style={{ gap: 10 }}>
                {cart.map((l) => {
                  const x = byKey.get(l.key);
                  return (
                    <div key={l.key} className="cart-line">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="cell-main">{x?.name || (items ? 'สินค้านี้ไม่มีในระบบแล้ว' : '…')}</div>
                        <div className="cell-sub"><span className="mono">{fmtNum(l.qty)}</span> {x?.unit}</div>
                      </div>
                      <button className="icon-btn plain" onClick={() => setCart((c) => c.filter((y) => y.key !== l.key))} aria-label={`ลบ ${x?.name || 'รายการ'} ออกจากตะกร้า`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
