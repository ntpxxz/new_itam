import { useEffect, useRef, useState } from 'react';
import { CameraOff } from 'lucide-react';

// Camera QR/Barcode scanner. Camera requires a secure context (HTTPS or localhost).
export default function QrScanner({ onResult, paused }) {
  const id = useRef(`qr-${Math.random().toString(36).slice(2)}`).current;
  const scanner = useRef(null);
  const last = useRef({ code: '', at: 0 });
  const cb = useRef(onResult);
  cb.current = onResult;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [error, setError] = useState(window.isSecureContext ? '' : 'insecure');

  useEffect(() => {
    if (!window.isSecureContext) return undefined;
    let stopped = false;
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (stopped) return;
      const s = new Html5Qrcode(id, { verbose: false });
      scanner.current = s;
      s.start({ facingMode: 'environment' }, { fps: 10, qrbox: (w, h) => { const m = Math.floor(Math.min(w, h) * 0.7); return { width: m, height: m }; } },
        (text) => {
          const now = Date.now();
          if (pausedRef.current) return;
          if (text === last.current.code && now - last.current.at < 2500) return;
          last.current = { code: text, at: now };
          navigator.vibrate?.(60);
          cb.current(text);
        }, () => {})
        .catch((e) => setError(String(e?.message || e).includes('Permission') || String(e).includes('NotAllowed') ? 'denied' : 'nocamera'));
    });
    return () => {
      stopped = true;
      const s = scanner.current;
      if (s?.isScanning) s.stop().then(() => s.clear()).catch(() => {});
    };
  }, [id]);

  if (error) {
    const msg = {
      insecure: 'เปิดกล้องได้เฉพาะเมื่อใช้งานผ่าน HTTPS หรือ localhost — ใช้กล้องมือถือสแกน QR บนสติ๊กเกอร์ได้โดยตรง หรือพิมพ์รหัสด้านล่าง',
      denied: 'ไม่ได้รับอนุญาตให้ใช้กล้อง — เปิดสิทธิ์กล้องในการตั้งค่าเบราว์เซอร์ แล้วโหลดหน้านี้ใหม่',
      nocamera: 'ไม่พบกล้องบนอุปกรณ์นี้ — พิมพ์หรือใช้เครื่องสแกนบาร์โค้ดกรอกรหัสด้านล่างแทน',
    }[error];
    return (
      <div className="scan-box" style={{ display: 'grid', placeItems: 'center', background: 'var(--bg-subtle)', border: '1px dashed var(--border-strong)', aspectRatio: 'auto', minHeight: 180 }}>
        <div className="empty" style={{ padding: 20 }}><CameraOff size={28} /><div style={{ fontSize: 13 }}>{msg}</div></div>
      </div>
    );
  }
  return <div className="scan-box" id={id} />;
}
