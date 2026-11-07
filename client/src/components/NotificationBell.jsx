import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, PackageX, CheckCheck } from 'lucide-react';
import { api } from '../api.js';
import { fmtDateTime } from '../format.js';

// Topbar bell: work alerts (overdue, low stock) + the user's own notifications (purchase order updates).
export default function NotificationBell({ badges, onChange }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const ref = useRef(null);
  const navigate = useNavigate();

  const load = () => api.get('/api/notifications').then(setData).catch(() => {});
  useEffect(() => {
    if (!open) return;
    load();
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const unread = badges.notifications || 0;
  const alerts = [
    badges.overdue > 0 && { label: `เกินกำหนดคืน ${badges.overdue} รายการ`, to: '/loans?filter=overdue', icon: AlertTriangle },
    badges.lowStock > 0 && { label: `สต็อกต่ำ ${badges.lowStock} รายการ`, to: '/assets?status=low', icon: PackageX },
  ].filter(Boolean);
  const total = unread + alerts.length;

  const go = async (to, n) => {
    setOpen(false);
    if (n && !n.read_at) { await api.post(`/api/notifications/${n.id}/read`).catch(() => {}); onChange(); }
    if (to) navigate(to);
  };
  const readAll = async () => {
    await api.post('/api/notifications/read-all').catch(() => {});
    load();
    onChange();
  };

  return (
    <div className="menu-wrap" ref={ref}>
      <button className="icon-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        aria-label={total ? `การแจ้งเตือน ${total} รายการ` : 'การแจ้งเตือน'} title="การแจ้งเตือน">
        <Bell size={18} />
        {unread > 0 ? <span className="count mono" aria-hidden>{unread > 99 ? '99+' : unread}</span> : alerts.length > 0 && <span className="dot" aria-hidden />}
      </button>
      {open && (
        <div className="menu notif-panel" role="dialog" aria-label="การแจ้งเตือน">
          <div className="notif-head">
            <strong>การแจ้งเตือน</strong>
            {unread > 0 && <button className="notif-readall" onClick={readAll}><CheckCheck size={14} />อ่านทั้งหมด</button>}
          </div>
          {alerts.map((a) => (
            <button key={a.to} className="notif-alert" onClick={() => go(a.to)}><a.icon size={15} />{a.label}</button>
          ))}
          {alerts.length > 0 && <hr />}
          {!data ? (
            <div className="notif-empty">กำลังโหลด…</div>
          ) : !data.rows.length ? (
            <div className="notif-empty">{alerts.length ? 'ไม่มีข้อความใหม่' : 'ไม่มีรายการที่ต้องดำเนินการ'}</div>
          ) : data.rows.map((n) => (
            <button key={n.id} className={`notif-item${n.read_at ? '' : ' unread'}`} onClick={() => go(n.link, n)}>
              <span className="notif-dot" aria-hidden />
              <span className="notif-text">
                <span className="notif-title">{n.title}{!n.read_at && <span className="sr-only"> (ยังไม่อ่าน)</span>}</span>
                {n.body && <span className="notif-body">{n.body}</span>}
                <span className="notif-time">{fmtDateTime(n.created_at)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
