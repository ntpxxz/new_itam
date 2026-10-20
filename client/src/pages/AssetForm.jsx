import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ImagePlus, Tag, Package, Info } from 'lucide-react';
import { api } from '../api.js';
import { useLookup } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Field, Select, Loading, CategorySelect } from '../components/ui.jsx';
import { addDaysISO, todayISO } from '../format.js';

const EMPTY = {
  category_id: '', name: '', brand: '', model: '', serial_no: '', specs: '', location_id: '', department_id: '',
  purchase_date: '', purchase_price: '', po_number: '', invoice_number: '', vendor_id: '', warranty_expiry: '', notes: '',
  // quantity-tracked
  unit: 'ชิ้น', qty_on_hand: '', reorder_point: '5', unit_cost: '',
  received_date: '',
};

// One form for every item. The chosen category's kind decides the fields:
// asset → per-item (tag, serial, warranty), consumable → quantity (unit, stock, reorder point).
export default function AssetForm() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const [sp] = useSearchParams();
  const editKind = id ? (pathname.startsWith('/consumables') ? 'consumable' : 'asset') : null;
  const isEdit = !!id;
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const [form, setForm] = useState({ ...EMPTY, category_id: sp.get('category_id') || '', received_date: todayISO() });
  const [tag, setTag] = useState('');
  const [loaded, setLoaded] = useState(!isEdit);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);

  const allCats = useLookup('categories');
  const locs = useLookup('locations');
  const depts = useLookup('departments');
  const vendors = useLookup('vendors');

  // Only offer categories the user may create, and never switch tracking type while editing.
  const cats = useMemo(() => allCats.filter((c) => (editKind ? c.kind === editKind
    : (c.kind === 'asset' ? can('asset.create') : can('consumable.manage')))), [allCats, editKind, can]);
  const cat = allCats.find((c) => String(c.id) === String(form.category_id));
  const kind = editKind || cat?.kind || null;
  const base = kind === 'consumable' ? '/consumables' : '/assets';

  useEffect(() => {
    if (!isEdit) return;
    const url = editKind === 'consumable' ? `/api/consumables/${id}` : `/api/assets/${id}`;
    api.get(url).then((d) => {
      const src = d.asset || d.item;
      const f = {};
      for (const k of Object.keys(EMPTY)) f[k] = src[k] ?? '';
      setForm(f);
      setTag(src.asset_tag || src.sku);
      setPreview(src.image_path || null);
      setLoaded(true);
    }).catch((e) => { toast.error(e); navigate('/assets'); });
  }, [id, editKind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isEdit) return;
    if (!cat) { setTag(''); return; }
    if (cat.kind === 'consumable') { setTag(`C-${cat.prefix}-····`); return; }
    api.get('/api/assets/next-tag', { category_id: cat.id }).then((d) => setTag(d.tag)).catch(() => {});
  }, [cat?.id, isEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v })); setErrors((e) => ({ ...e, [k]: null })); };

  const pickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error('รูปใหญ่เกิน 8 MB — ลดขนาดรูปก่อนอัปโหลด'); return; }
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.category_id) errs.category_id = 'กรุณาเลือกหมวดหมู่';
    if (!form.name.trim()) errs.name = 'กรุณากรอกชื่อ';
    if (form.received_date && form.received_date > todayISO()) errs.received_date = 'วันที่รับเข้าต้องไม่เป็นวันในอนาคต';
    if (kind === 'asset') {
      if (form.received_date && form.purchase_date && form.received_date < form.purchase_date) errs.received_date = 'วันที่รับเข้าต้องไม่ก่อนวันที่ซื้อ';
      if (form.purchase_price && Number(form.purchase_price) < 0) errs.purchase_price = 'ราคาต้องไม่ติดลบ';
      if (form.warranty_expiry && form.purchase_date && form.warranty_expiry < form.purchase_date) errs.warranty_expiry = 'วันหมดประกันต้องอยู่หลังวันที่ซื้อ';
    } else {
      if (form.qty_on_hand !== '' && Number(form.qty_on_hand) < 0) errs.qty_on_hand = 'จำนวนต้องไม่ติดลบ';
      if (Number(form.reorder_point) < 0) errs.reorder_point = 'จุดสั่งซื้อต้องไม่ติดลบ';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      let saved;
      if (kind === 'consumable') {
        saved = isEdit ? await api.put(`/api/consumables/${id}`, form) : await api.post('/api/consumables', form);
      } else {
        saved = isEdit ? await api.put(`/api/assets/${id}`, form) : await api.post('/api/assets', form);
        if (image) {
          const fd = new FormData();
          fd.append('image', image);
          await api.post(`/api/assets/${saved.id}/image`, fd).catch((err) => toast.error(`บันทึกข้อมูลแล้ว แต่อัปโหลดรูปไม่สำเร็จ: ${err.message}`));
        }
      }
      toast.success(isEdit ? 'บันทึกการแก้ไขแล้ว' : `เพิ่ม ${saved.asset_tag || saved.sku} แล้ว`);
      navigate(`${base}/${saved.id}`, { replace: true });
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <Card><Loading rows={8} /></Card>;

  return (
    <form onSubmit={submit} noValidate className="stack" style={{ gap: 20 }}>
      <PageHeader
        title={isEdit ? 'แก้ไขอุปกรณ์' : 'เพิ่มอุปกรณ์'}
        crumbs={[{ label: 'อุปกรณ์', to: '/assets' }, ...(isEdit ? [{ label: tag, to: `${base}/${id}` }] : []), { label: isEdit ? 'แก้ไข' : 'เพิ่มใหม่' }]}
      >
        <Link to={isEdit ? `${base}/${id}` : '/assets'} className="btn">ยกเลิก</Link>
        <button className="btn btn-primary" disabled={busy || !kind}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
      </PageHeader>

      <div className="detail-grid">
        <div className="stack">
          <Card title="ข้อมูลอุปกรณ์">
            <div className="form-grid">
              <Field label="หมวดหมู่" required error={errors.category_id}
                hint={kind === 'consumable' ? 'หมวดนี้นับเป็นจำนวน (วัสดุสิ้นเปลือง)' : kind === 'asset' ? 'หมวดนี้ติดตามรายชิ้นด้วยรหัสทรัพย์สิน' : 'หมวดหมู่กำหนดวิธีติดตาม: รายชิ้น หรือ นับจำนวน'}>
                <CategorySelect value={form.category_id} onChange={set('category_id')} categories={cats} />
              </Field>
              <Field label={kind === 'consumable' ? 'รหัส (SKU)' : 'รหัสทรัพย์สิน'} hint={isEdit ? 'ออกโดยระบบ แก้ไขไม่ได้' : 'ระบบออกให้อัตโนมัติเมื่อบันทึก'}>
                <div className="input mono row" style={{ background: 'var(--bg-subtle)', color: tag ? 'var(--text)' : 'var(--text-subtle)' }} aria-readonly>
                  <Tag size={14} aria-hidden />{tag || 'เลือกหมวดหมู่ก่อน'}
                </div>
              </Field>
              <Field label="ชื่อ" required error={errors.name} className="span-2">
                <input className="input" value={form.name} onChange={set('name')} maxLength={200}
                  placeholder={kind === 'consumable' ? 'เช่น เมาส์ USB Logitech B100' : 'เช่น โน้ตบุ๊ก Dell Latitude 5440'} />
              </Field>
              {kind === 'asset' && (
                <>
                  <Field label="ยี่ห้อ"><input className="input" value={form.brand} onChange={set('brand')} placeholder="Dell" /></Field>
                  <Field label="รุ่น"><input className="input" value={form.model} onChange={set('model')} placeholder="Latitude 5440" /></Field>
                  <Field label="Serial Number" hint="ใช้ค้นหาและสแกนแทนรหัสทรัพย์สินได้" className="span-2">
                    <input className="input mono" value={form.serial_no} onChange={set('serial_no')} autoCapitalize="characters" />
                  </Field>
                  <Field label="สเปก" className="span-2">
                    <textarea className="textarea" value={form.specs} onChange={set('specs')} placeholder="CPU / RAM / Storage / ขนาดจอ" rows={2} />
                  </Field>
                </>
              )}
              {kind === 'consumable' && (
                <>
                  <Field label="หน่วยนับ"><input className="input" value={form.unit} onChange={set('unit')} placeholder="ชิ้น, เส้น, ตลับ, กล่อง" /></Field>
                  {!isEdit ? (
                    <Field label="ยอดยกมา" hint="จำนวนที่มีอยู่ตอนนี้" error={errors.qty_on_hand}>
                      <input type="number" min="0" inputMode="numeric" className="input mono" value={form.qty_on_hand} onChange={set('qty_on_hand')} placeholder="0" />
                    </Field>
                  ) : (
                    <Field label="คงเหลือ" hint="เปลี่ยนยอดผ่าน รับเข้า / เบิก / ปรับยอด ในหน้ารายละเอียด">
                      <div className="input mono" style={{ background: 'var(--bg-subtle)' }} aria-readonly>{form.qty_on_hand} {form.unit}</div>
                    </Field>
                  )}
                  {!isEdit && (
                    <Field label="วันที่รับเข้า" hint="วันที่ของยอดยกมา (ค่าเริ่มต้น = วันนี้)" error={errors.received_date}>
                      <input type="date" className="input" value={form.received_date} onChange={set('received_date')} max={todayISO()} />
                    </Field>
                  )}
                  <Field label="จุดสั่งซื้อ (Reorder point)" hint="แจ้งเตือนเมื่อคงเหลือ ≤ ค่านี้" error={errors.reorder_point}>
                    <input type="number" min="0" inputMode="numeric" className="input mono" value={form.reorder_point} onChange={set('reorder_point')} />
                  </Field>
                  <Field label="ราคาต่อหน่วย (บาท)">
                    <input type="number" min="0" step="0.01" inputMode="decimal" className="input mono" value={form.unit_cost} onChange={set('unit_cost')} />
                  </Field>
                </>
              )}
            </div>
            {!kind && (
              <div className="alert info" style={{ marginTop: 16 }}>
                <Info size={18} /><span className="alert-detail">เลือกหมวดหมู่ก่อน ระบบจะแสดงช่องข้อมูลให้ตรงกับวิธีติดตามของหมวดนั้น</span>
              </div>
            )}
          </Card>

          {kind === 'asset' && (
            <Card title="การเงินและสัญญา">
              <div className="form-grid">
                <Field label="วันที่ซื้อ"><input type="date" className="input" value={form.purchase_date} onChange={set('purchase_date')} max={addDaysISO(0)} /></Field>
                <Field label="วันที่รับเข้า" hint="วันที่อุปกรณ์เข้าคลังจริง (ค่าเริ่มต้น = วันนี้)" error={errors.received_date}>
                  <input type="date" className="input" value={form.received_date} onChange={set('received_date')} max={todayISO()} />
                </Field>
                <Field label="ราคาซื้อ (บาท)" error={errors.purchase_price}>
                  <input type="number" inputMode="decimal" min="0" step="0.01" className="input mono" value={form.purchase_price} onChange={set('purchase_price')} />
                </Field>
                <Field label="เลข PO"><input className="input mono" value={form.po_number} onChange={set('po_number')} /></Field>
                <Field label="เลขใบแจ้งหนี้"><input className="input mono" value={form.invoice_number} onChange={set('invoice_number')} /></Field>
                <Field label="ผู้ขาย (Vendor)">
                  <Select value={form.vendor_id} onChange={set('vendor_id')} options={vendors.map((v) => ({ value: v.id, label: v.name }))} />
                </Field>
                <Field label="วันหมดประกัน" hint="ระบบจะแจ้งเตือนล่วงหน้าบน Dashboard" error={errors.warranty_expiry}>
                  <input type="date" className="input" value={form.warranty_expiry} onChange={set('warranty_expiry')} />
                </Field>
              </div>
            </Card>
          )}
        </div>

        <div className="stack">
          {kind === 'asset' && (
            <Card title="รูปภาพ">
              <label className="stack" style={{ gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                <div className="asset-photo" style={{ width: '100%', height: 180 }}>
                  {preview ? <img src={preview} alt="ตัวอย่างรูปอุปกรณ์" /> : <ImagePlus size={28} aria-hidden />}
                </div>
                <span className="btn btn-sm"><ImagePlus size={14} />{preview ? 'เปลี่ยนรูป' : 'เลือกรูป'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={pickImage} />
              </label>
              <p className="field-hint" style={{ textAlign: 'center', marginTop: 8 }}>JPG, PNG, WEBP ไม่เกิน 8 MB · บนมือถือถ่ายรูปได้ทันที</p>
            </Card>
          )}
          {kind && (
            <Card title="การจัดเก็บ">
              <div className="stack" style={{ gap: 14 }}>
                <Field label={kind === 'consumable' ? 'สถานที่เก็บ' : 'สถานที่'}>
                  <Select value={form.location_id} onChange={set('location_id')} options={locs.map((l) => ({ value: l.id, label: l.branch ? `${l.name} · ${l.branch}` : l.name }))} />
                </Field>
                {kind === 'asset' && (
                  <Field label="แผนกเจ้าของ"><Select value={form.department_id} onChange={set('department_id')} options={depts.map((d) => ({ value: d.id, label: d.name }))} /></Field>
                )}
                {kind === 'consumable' && (
                  <Field label="ผู้ขาย"><Select value={form.vendor_id} onChange={set('vendor_id')} options={vendors.map((v) => ({ value: v.id, label: v.name }))} /></Field>
                )}
                <Field label="หมายเหตุ"><textarea className="textarea" value={form.notes} onChange={set('notes')} rows={3} /></Field>
              </div>
            </Card>
          )}
          {!kind && (
            <Card>
              <div className="empty" style={{ padding: 24 }}><Package size={28} /><div style={{ fontSize: 13 }}>ช่องข้อมูลจะปรากฏหลังเลือกหมวดหมู่</div></div>
            </Card>
          )}
        </div>
      </div>
    </form>
  );
}
