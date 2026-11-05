import { useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';

// Item photo on a detail page; users who may edit can pick/replace it in place.
export default function ItemPhoto({ src, alt, icon: Icon, uploadUrl, canEdit, onDone, style }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error('รูปใหญ่เกิน 8 MB — ลดขนาดรูปก่อนอัปโหลด'); return; }
    const fd = new FormData();
    fd.append('image', file);
    setBusy(true);
    try {
      await api.post(uploadUrl, fd);
      toast.success('บันทึกรูปแล้ว');
      onDone?.();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const photo = <div className="asset-photo" style={style}>{src ? <img src={src} alt={alt} /> : <Icon size={32} aria-hidden />}</div>;
  if (!canEdit) return photo;
  return (
    <label className="stack" style={{ gap: 8, alignItems: 'center', cursor: busy ? 'progress' : 'pointer', flex: 'none' }}>
      {photo}
      <span className="btn btn-sm"><ImagePlus size={14} />{busy ? 'กำลังอัปโหลด…' : src ? 'เปลี่ยนรูป' : 'เลือกรูป'}</span>
      <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={pick} disabled={busy} />
    </label>
  );
}
