import { useId, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import Photo from './Photo.jsx';

// Item photo on a detail page: click to view it larger; users who may edit can pick/replace it.
export default function ItemPhoto({ src, alt, icon: Icon, uploadUrl, canEdit, onDone, style }) {
  const toast = useToast();
  const inputId = useId();
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

  const photo = <Photo src={src} alt={alt} icon={Icon} iconSize={32} className="asset-photo" style={style} lazy={false} />;
  if (!canEdit) return photo;
  return (
    <div className="stack" style={{ gap: 8, alignItems: 'center', flex: 'none' }}>
      {src ? photo : <label htmlFor={inputId} style={{ cursor: busy ? 'progress' : 'pointer' }}>{photo}</label>}
      <label htmlFor={inputId} className="btn btn-sm" style={{ cursor: busy ? 'progress' : 'pointer' }}>
        <ImagePlus size={14} />{busy ? 'กำลังอัปโหลด…' : src ? 'เปลี่ยนรูป' : 'เลือกรูป'}
      </label>
      <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={pick} disabled={busy} />
    </div>
  );
}
