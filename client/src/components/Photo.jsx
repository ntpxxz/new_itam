import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink } from 'lucide-react';
import { Modal } from './ui.jsx';

export function PhotoViewer({ src, alt, onClose }) {
  // Portal + stopPropagation: viewers open from clickable table rows and file-picker labels.
  return createPortal(
    <div onClick={(e) => e.stopPropagation()}>
      <Modal title={alt || 'รูปภาพ'} onClose={onClose} wide initialFocus={false}
        footer={<a className="btn" href={src} target="_blank" rel="noreferrer"><ExternalLink size={14} />เปิดรูปขนาดเต็ม</a>}>
        <div className="photo-view"><img src={src} alt={alt} /></div>
      </Modal>
    </div>,
    document.body,
  );
}

// Item thumbnail; when it has a photo, clicking it opens the photo larger.
export default function Photo({ src, alt, icon: Icon, iconSize = 16, className = 'thumb', style, lazy = true }) {
  const [open, setOpen] = useState(false);
  if (!src) return <span className={className} style={style}>{Icon && <Icon size={iconSize} aria-hidden />}</span>;
  const show = (e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); };
  return (
    <>
      <button type="button" className={`${className} zoomable`} style={style} onClick={show} aria-label={alt ? `ดูรูป ${alt}` : 'ดูรูป'} title="คลิกเพื่อดูรูป">
        <img src={src} alt="" loading={lazy ? 'lazy' : undefined} />
      </button>
      {open && <PhotoViewer src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}
